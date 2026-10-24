export const TMDB_CACHE_MAX_ROWS = 400;
export const TMDB_CACHE_MAX_BYTES = 8 * 1024 * 1024;

export type CacheEvictionRow = {
  key: string;
  bytes: number;
  fetchedAt: number;
  staleUntil: number;
};

/** Drop rows past their stale time, then the oldest rows past the row or byte cap. */
export function planCacheEvictions(
  rows: CacheEvictionRow[],
  now: number,
  limits: { maxRows: number; maxBytes: number } = {
    maxRows: TMDB_CACHE_MAX_ROWS,
    maxBytes: TMDB_CACHE_MAX_BYTES,
  },
): string[] {
  const drop: string[] = [];
  const fresh: CacheEvictionRow[] = [];
  for (const row of rows) {
    if (row.staleUntil <= now) drop.push(row.key);
    else fresh.push(row);
  }
  fresh.sort((left, right) => right.fetchedAt - left.fetchedAt || left.key.localeCompare(right.key));
  let bytes = 0;
  fresh.forEach((row, index) => {
    const next = bytes + Math.max(0, row.bytes);
    if (index >= limits.maxRows || next > limits.maxBytes) drop.push(row.key);
    else bytes = next;
  });
  return drop;
}
