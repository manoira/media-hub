import { db, watchlistTable } from "@workspace/db";

const CACHE_TTL_MS = 60_000;

type WatchlistRow = typeof watchlistTable.$inferSelect;

let snapshotCache: {
  rows: WatchlistRow[];
  keys: Set<string>;
  expiresAt: number;
} | null = null;

function buildKeys(rows: WatchlistRow[]): Set<string> {
  return new Set(rows.map((row) => `${row.mediaType}:${row.tmdbId}`));
}

/** Cached watchlist snapshot — one DB round-trip shared across filters in a warm instance. */
export async function getCachedWatchlistSnapshot(): Promise<{
  rows: WatchlistRow[];
  keys: Set<string>;
}> {
  const now = Date.now();
  if (snapshotCache && now < snapshotCache.expiresAt) {
    return { rows: snapshotCache.rows, keys: snapshotCache.keys };
  }

  const rows = await db.select().from(watchlistTable);
  const keys = buildKeys(rows);
  snapshotCache = { rows, keys, expiresAt: now + CACHE_TTL_MS };
  return { rows, keys };
}

export function invalidateWatchlistCache(): void {
  snapshotCache = null;
}
