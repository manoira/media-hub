import { Router, type IRouter } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
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
    status: item.status as "watching" | "watched" | "want_to_watch",
    userRating: item.userRating ?? null,
    notes: item.notes ?? null,
    addedAt: item.addedAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    title: item.title,
    posterPath: item.posterPath ?? null,
    backdropPath: item.backdropPath ?? null,
    releaseDate: item.releaseDate ?? null,
    voteAverage: item.voteAverage ?? null,
    genreIds: (item.genreIds ?? []).map(Number),
    overview: item.overview ?? null,
  };
}

const router: IRouter = Router();

router.get("/watchlist", async (req, res): Promise<void> => {
  const parsed = GetWatchlistQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, type, sort_by = "added_at" } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(watchlistTable.status, status));
  if (type) conditions.push(eq(watchlistTable.mediaType, type));

  const orderBy = sort_by === "title"
    ? asc(watchlistTable.title)
    : sort_by === "rating"
    ? desc(watchlistTable.voteAverage)
    : sort_by === "release_date"
    ? desc(watchlistTable.releaseDate)
    : desc(watchlistTable.addedAt);

  const items = conditions.length > 0
    ? await db.select().from(watchlistTable).where(and(...conditions)).orderBy(orderBy)
    : await db.select().from(watchlistTable).orderBy(orderBy);

  res.json(GetWatchlistResponse.parse(items.map(serializeItem)));
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
