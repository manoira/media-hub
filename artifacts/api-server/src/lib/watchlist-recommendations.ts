import { db, watchlistTable } from "@workspace/db";
import { getSimilar } from "./tmdb";

const SEED_COUNT = 5;
const SIMILAR_PER_SEED = 8;
const RESULT_LIMIT = 16;

type MediaItem = Awaited<ReturnType<typeof getSimilar>>["results"][number];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mediaKey(item: { mediaType: string; tmdbId: number }): string {
  return `${item.mediaType}:${item.tmdbId}`;
}

export async function getWatchlistBasedRecommendations(): Promise<{
  results: MediaItem[];
  totalResults: number;
  totalPages: number;
  page: number;
}> {
  const watchlist = await db.select().from(watchlistTable);
  if (watchlist.length === 0) {
    return { results: [], totalResults: 0, totalPages: 1, page: 1 };
  }

  const trackedKeys = new Set(watchlist.map((row) => mediaKey(row)));
  const seeds = shuffle(watchlist).slice(0, Math.min(SEED_COUNT, watchlist.length));

  const similarPages = await Promise.all(
    seeds.map((seed) =>
      getSimilar(seed.mediaType, seed.tmdbId).catch(() => ({
        results: [] as MediaItem[],
        totalResults: 0,
        totalPages: 0,
        page: 1,
      })),
    ),
  );

  const seen = new Set<string>();
  const merged: MediaItem[] = [];

  for (const page of shuffle(similarPages)) {
    for (const item of shuffle(page.results).slice(0, SIMILAR_PER_SEED)) {
      const key = mediaKey(item);
      if (trackedKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= RESULT_LIMIT) break;
    }
    if (merged.length >= RESULT_LIMIT) break;
  }

  const results = shuffle(merged).slice(0, RESULT_LIMIT);
  return {
    results,
    totalResults: results.length,
    totalPages: 1,
    page: 1,
  };
}
