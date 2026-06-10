import { Router, type IRouter } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq, desc, count, avg } from "drizzle-orm";
import {
  GetStatsSummaryResponse,
  GetGenreStatsResponse,
  GetRecentlyWatchedQueryParams,
  GetRecentlyWatchedResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/summary", async (_req, res): Promise<void> => {
  const all = await db.select().from(watchlistTable);
  const totalWatched = all.filter(i => i.status === "watched").length;
  const totalWatching = all.filter(i => i.status === "watching").length;
  const totalWantToWatch = all.filter(i => i.status === "want_to_watch").length;
  const totalMovies = all.filter(i => i.mediaType === "movie").length;
  const totalTvShows = all.filter(i => i.mediaType === "tv").length;
  const rated = all.filter(i => i.userRating !== null && i.userRating !== undefined);
  const averageRating = rated.length > 0
    ? rated.reduce((sum, i) => sum + (i.userRating ?? 0), 0) / rated.length
    : null;

  res.json(GetStatsSummaryResponse.parse({
    totalWatched,
    totalWatching,
    totalWantToWatch,
    totalMovies,
    totalTvShows,
    averageRating: averageRating !== null ? Math.round(averageRating * 10) / 10 : null,
    totalItems: all.length,
  }));
});

router.get("/stats/genres", async (_req, res): Promise<void> => {
  const all = await db.select().from(watchlistTable);

  const genreCountMap = new Map<number, number>();
  for (const item of all) {
    for (const gid of item.genreIds ?? []) {
      const id = Number(gid);
      genreCountMap.set(id, (genreCountMap.get(id) ?? 0) + 1);
    }
  }

  const GENRE_NAMES: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
    878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
  };

  const stats = Array.from(genreCountMap.entries())
    .map(([genreId, count]) => ({
      genreId,
      genreName: GENRE_NAMES[genreId] ?? `Genre ${genreId}`,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  res.json(GetGenreStatsResponse.parse(stats));
});

router.get("/stats/recently-watched", async (req, res): Promise<void> => {
  const parsed = GetRecentlyWatchedQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const limit = parsed.data.limit ?? 10;

  const items = await db
    .select()
    .from(watchlistTable)
    .where(eq(watchlistTable.status, "watched"))
    .orderBy(desc(watchlistTable.updatedAt))
    .limit(limit);

  res.json(GetRecentlyWatchedResponse.parse(
    items.map(item => ({
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
    }))
  ));
});

export default router;
