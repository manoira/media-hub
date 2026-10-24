import { Router, type IRouter } from "express";
import { db, pool, watchEventsTable, watchlistTable } from "@workspace/db";
import { eq, and, desc, asc, inArray, gte, sql, type SQL } from "drizzle-orm";
import { serializeWatchlistItem } from "../lib/watchlist-item";
import { fetchKeywords, getMovieDetails, getTvDetails } from "../lib/tmdb";
import { invalidateWatchlistCache } from "../lib/watchlist-cache";
import { recordLocalRead } from "../lib/tmdb-cache";
import { acceptImdbId } from "@workspace/db";
import { catalogEtag, notModified } from "../lib/private-cache";
import {
  GetWatchlistQueryParams,
  GetWatchlistResponse,
  AddToWatchlistBody,
  UpdateWatchlistItemBody,
  UpdateWatchlistItemParams,
  UpdateWatchlistItemResponse,
  RemoveFromWatchlistParams,
  GetWatchStatusParams,
  GetWatchStatusResponse,
} from "@workspace/api-zod";

const ARRAY_QUERY_KEYS = [
  "status",
  "type",
  "genre",
  "min_rating",
  "year_range",
  "language",
] as const;

function normalizeArrayQuery(query: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...query };
  for (const key of ARRAY_QUERY_KEYS) {
    const value = normalized[key];
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    normalized[key] = values.flatMap((entry) => {
      if (typeof entry !== "string" || !entry.includes(",")) return [entry];
      return entry.split(",").map(part => part.trim()).filter(Boolean);
    });
  }
  return normalized;
}

type YearRange = { min?: number; max?: number };

function parseYearRangeParam(raw: string): YearRange | null {
  if (!raw) return null;
  if (raw.includes("-")) {
    const [minStr, maxStr] = raw.split("-");
    const min = minStr ? parseInt(minStr, 10) : undefined;
    const max = maxStr ? parseInt(maxStr, 10) : undefined;
    return {
      min: min !== undefined && !Number.isNaN(min) ? min : undefined,
      max: max !== undefined && !Number.isNaN(max) ? max : undefined,
    };
  }
  const year = parseInt(raw, 10);
  if (Number.isNaN(year)) return null;
  return { min: year, max: year };
}

function buildYearRangeCondition(ranges: YearRange[]): SQL | undefined {
  if (ranges.length === 0) return undefined;

  const yearExpr = sql`CAST(SUBSTRING(${watchlistTable.releaseDate} FROM 1 FOR 4) AS INTEGER)`;
  const rangeConditions = ranges.map((range) => {
    const parts: SQL[] = [];
    if (range.min !== undefined) parts.push(sql`${yearExpr} >= ${range.min}`);
    if (range.max !== undefined) parts.push(sql`${yearExpr} <= ${range.max}`);
    if (parts.length === 0) return sql`false`;
    if (parts.length === 1) return parts[0];
    return sql`${parts[0]} AND ${parts[1]}`;
  });

  return sql`(${sql.join(rangeConditions, sql` OR `)})`;
}

function buildGenreOverlapCondition(genreIds: number[]): SQL | undefined {
  if (genreIds.length === 0) return undefined;
  const genreStrings = genreIds.map(String);
  return sql`${watchlistTable.genreIds} && ARRAY[${sql.join(
    genreStrings.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`;
}

function buildRatingCondition(minRatings: number[]): SQL | undefined {
  if (minRatings.length === 0) return undefined;
  const threshold = Math.min(...minRatings);
  return gte(watchlistTable.voteAverage, threshold);
}

async function fetchTmdbDetails(tmdbId: number, mediaType: string) {
  const keywords = await fetchKeywords(mediaType, tmdbId).catch(() => []);
  const keywordIds = keywords.map(k => k.id);
  try {
    const details = mediaType === "tv"
      ? await getTvDetails(tmdbId)
      : await getMovieDetails(tmdbId);
    return {
      title: details.title,
      posterPath: details.posterPath,
      backdropPath: details.backdropPath,
      releaseDate: details.releaseDate,
      originalLanguage: details.originalLanguage,
      adult: details.adult,
      voteAverage: details.voteAverage,
      overview: details.overview,
      genreIds: details.genres.map(g => String(g.id)),
      keywordIds,
      productionCountries: details.productionCountryCodes,
      runtimeMinutes: details.runtime,
      imdbId: acceptImdbId({
        requestedTmdbId: tmdbId,
        returnedTmdbId: details.tmdbId,
        imdbId: details.imdbId,
      }),
    };
  } catch {
    return { keywordIds };
  }
}

const serializeItem = serializeWatchlistItem;

const router: IRouter = Router();

router.get("/watchlist", async (req, res): Promise<void> => {
  const started = Date.now();
  try {
  const parsed = GetWatchlistQueryParams.safeParse(normalizeArrayQuery(req.query as Record<string, unknown>));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    status,
    type,
    genre,
    min_rating,
    year_range,
    language,
    sort_by = "added_at",
  } = parsed.data;

  const conditions: SQL[] = [];

  if (status?.length) {
    conditions.push(inArray(watchlistTable.status, status));
  }
  if (type?.length) {
    conditions.push(inArray(watchlistTable.mediaType, type));
  }
  if (genre?.length) {
    const genreCondition = buildGenreOverlapCondition(genre);
    if (genreCondition) conditions.push(genreCondition);
  }
  if (min_rating?.length) {
    const ratingCondition = buildRatingCondition(min_rating);
    if (ratingCondition) conditions.push(ratingCondition);
  }
  if (year_range?.length) {
    const ranges = year_range
      .map(parseYearRangeParam)
      .filter((range): range is YearRange => range !== null);
    const yearCondition = buildYearRangeCondition(ranges);
    if (yearCondition) conditions.push(yearCondition);
  }
  if (language?.length) {
    conditions.push(inArray(watchlistTable.originalLanguage, language));
  }

  const orderBy = sort_by === "title"
    ? asc(watchlistTable.title)
    : sort_by === "rating"
    ? desc(watchlistTable.voteAverage)
    : sort_by === "release_date"
    ? desc(watchlistTable.releaseDate)
    : desc(watchlistTable.addedAt);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const unfiltered = !whereClause;
  if (unfiltered) {
    const stamp = await pool.query<{ count: number; latest: Date | null }>(
      "SELECT count(*)::int AS count, max(updated_at) AS latest FROM watchlist",
    );
    const etag = catalogEtag(stamp.rows[0]?.count ?? 0, stamp.rows[0]?.latest ?? null, sort_by);
    if (notModified(req, res, etag)) return;
  } else {
    res.set("Cache-Control", "private, no-cache");
  }

  const items = whereClause
    ? await db.select().from(watchlistTable).where(whereClause).orderBy(orderBy)
    : await db.select().from(watchlistTable).orderBy(orderBy);

  await recordLocalRead("list", Date.now() - started).catch(() => undefined);
  const serialized = items.map(serializeItem);
  res.json(unfiltered ? serialized : GetWatchlistResponse.parse(serialized));
  } catch (err: unknown) {
    req.log.error({ err }, "GET /watchlist failed");
    res.status(500).json({ error: "Failed to load watchlist" });
  }
});

router.post("/watchlist", async (req, res): Promise<void> => {
  const parsed = AddToWatchlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tmdbId, mediaType, status, userRating, notes } = parsed.data;

  const existing = await db
    .select()
    .from(watchlistTable)
    .where(and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, mediaType)));

  if (existing.length > 0) {
    const [updated] = await db
      .update(watchlistTable)
      .set({ status, userRating: userRating ?? null, notes: notes ?? null })
      .where(eq(watchlistTable.id, existing[0].id))
      .returning();
    invalidateWatchlistCache();
    res.status(201).json(serializeItem(updated));
    return;
  }

  const tmdbData = await fetchTmdbDetails(tmdbId, mediaType);

  const [inserted] = await db.insert(watchlistTable).values({
    tmdbId,
    mediaType,
    status,
    userRating: userRating ?? null,
    notes: notes ?? null,
    title: tmdbData?.title ?? "Unknown",
    posterPath: tmdbData?.posterPath ?? null,
    backdropPath: tmdbData?.backdropPath ?? null,
    releaseDate: tmdbData?.releaseDate ?? null,
    originalLanguage: tmdbData?.originalLanguage ?? null,
    adult: tmdbData?.adult ?? null,
    voteAverage: tmdbData?.voteAverage ?? null,
    overview: tmdbData?.overview ?? null,
    genreIds: tmdbData?.genreIds ?? [],
    keywordIds: tmdbData?.keywordIds ?? [],
    productionCountries: tmdbData?.productionCountries ?? null,
    runtimeMinutes: tmdbData?.runtimeMinutes ?? null,
    imdbId: tmdbData?.imdbId ?? null,
    metadataFetchedAt: new Date(),
  }).returning();

  invalidateWatchlistCache();
  res.status(201).json(serializeItem(inserted));
});

router.patch("/watchlist/:id", async (req, res): Promise<void> => {
  const params = UpdateWatchlistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateWatchlistItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(watchlistTable)
    .where(eq(watchlistTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const updateData: Partial<{
    status: string;
    userRating: number | null;
    notes: string | null;
    tags: string[] | null;
    statusChangedAt: Date;
    updatedAt: Date;
  }> = {};
  updateData.updatedAt = new Date();
  if (body.data.status !== undefined) updateData.status = body.data.status;
  if (body.data.userRating !== undefined) updateData.userRating = body.data.userRating ?? null;
  if (body.data.notes !== undefined) updateData.notes = body.data.notes ?? null;
  if (body.data.tags !== undefined) updateData.tags = body.data.tags;
  const statusChanged = body.data.status !== undefined && body.data.status !== current.status;
  if (statusChanged) updateData.statusChangedAt = new Date();

  const [updated] = await db
    .update(watchlistTable)
    .set(updateData)
    .where(eq(watchlistTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const becameWatched = statusChanged && body.data.status === "watched";
  const leftWatched = statusChanged && current.status === "watched" && body.data.status !== "watched";
  if (becameWatched || leftWatched) {
    await db.insert(watchEventsTable).values({
      tmdbId: current.tmdbId,
      mediaType: current.mediaType,
      action: becameWatched ? "watched" : "unwatched",
      occurredAt: new Date(),
    });
  }
  invalidateWatchlistCache();
  res.json(UpdateWatchlistItemResponse.parse(serializeItem(updated)));
});

router.delete("/watchlist/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db.delete(watchlistTable).where(eq(watchlistTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  invalidateWatchlistCache();
  res.sendStatus(204);
});

router.get("/watchlist/status/:mediaType/:tmdbId", async (req, res): Promise<void> => {
  const params = GetWatchStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { mediaType, tmdbId } = params.data;

  const [entry] = await db
    .select()
    .from(watchlistTable)
    .where(and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, mediaType)));

  res.json(GetWatchStatusResponse.parse({
    inWatchlist: !!entry,
    entry: entry ? serializeItem(entry) : null,
  }));
});

export default router;
