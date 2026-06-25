import { Router, type IRouter } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq, and, desc, asc, inArray, gte, sql, type SQL } from "drizzle-orm";
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

const TMDB_BASE = "https://api.themoviedb.org/3";

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
  const apiKey = process.env.TMDB_API_KEY;
  const endpoint = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const url = `${TMDB_BASE}${endpoint}?api_key=${apiKey}`;
  const res = await globalThis.fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as Record<string, unknown>;
  if (mediaType === "tv") {
    return {
      title: (data.name as string) || "Unknown",
      posterPath: (data.poster_path as string | null) ?? null,
      backdropPath: (data.backdrop_path as string | null) ?? null,
      releaseDate: (data.first_air_date as string | null) ?? null,
      originalLanguage: (data.original_language as string | null) ?? null,
      voteAverage: (data.vote_average as number | null) ?? null,
      overview: (data.overview as string | null) ?? null,
      genreIds: ((data.genres as { id: number }[] | null) ?? []).map(g => String(g.id)),
    };
  }
  return {
    title: (data.title as string) || "Unknown",
    posterPath: (data.poster_path as string | null) ?? null,
    backdropPath: (data.backdrop_path as string | null) ?? null,
    releaseDate: (data.release_date as string | null) ?? null,
    originalLanguage: (data.original_language as string | null) ?? null,
    voteAverage: (data.vote_average as number | null) ?? null,
    overview: (data.overview as string | null) ?? null,
    genreIds: ((data.genres as { id: number }[] | null) ?? []).map(g => String(g.id)),
  };
}

function serializeItem(item: typeof watchlistTable.$inferSelect) {
  return {
    id: item.id,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType as "movie" | "tv",
    status: item.status as "watching" | "watched" | "want_to_watch" | "unsure",
    userRating: item.userRating ?? null,
    notes: item.notes ?? null,
    addedAt: item.addedAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    title: item.title,
    posterPath: item.posterPath ?? null,
    backdropPath: item.backdropPath ?? null,
    releaseDate: item.releaseDate ?? null,
    originalLanguage: item.originalLanguage ?? null,
    voteAverage: item.voteAverage ?? null,
    genreIds: (item.genreIds ?? []).map(Number),
    overview: item.overview ?? null,
  };
}

const router: IRouter = Router();

router.get("/watchlist", async (req, res): Promise<void> => {
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

  const items = whereClause
    ? await db.select().from(watchlistTable).where(whereClause).orderBy(orderBy)
    : await db.select().from(watchlistTable).orderBy(orderBy);

  res.json(GetWatchlistResponse.parse(items.map(serializeItem)));
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
    voteAverage: tmdbData?.voteAverage ?? null,
    overview: tmdbData?.overview ?? null,
    genreIds: tmdbData?.genreIds ?? [],
  }).returning();

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

  const updateData: Partial<{ status: string; userRating: number | null; notes: string | null }> = {};
  if (body.data.status !== undefined) updateData.status = body.data.status;
  if (body.data.userRating !== undefined) updateData.userRating = body.data.userRating ?? null;
  if (body.data.notes !== undefined) updateData.notes = body.data.notes ?? null;

  const [updated] = await db
    .update(watchlistTable)
    .set(updateData)
    .where(eq(watchlistTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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
