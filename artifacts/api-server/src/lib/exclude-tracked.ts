import { db, watchlistTable } from "@workspace/db";
import { getCachedWatchlistSnapshot } from "./watchlist-cache";

type MediaResult = { mediaType: string; tmdbId: number };
type MediaSearchResult = { results: MediaResult[] };

/** Query booleans must not use z.coerce.boolean() — String("false") is truthy in JS. */
export function parseExcludeTrackedFromQuery(
  query: Record<string, unknown>,
): boolean {
  const raw = query.exclude_tracked;
  if (raw === undefined || raw === null || raw === "") return false;
  if (typeof raw === "boolean") return raw;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

export async function getTrackedMediaKeys(): Promise<Set<string>> {
  const { keys } = await getCachedWatchlistSnapshot();
  return keys;
}

export function filterExcludedTracked<T extends MediaSearchResult>(
  result: T,
  tracked: Set<string>,
): T {
  if (tracked.size === 0) return result;
  return {
    ...result,
    results: result.results.filter(
      (item) => !tracked.has(`${item.mediaType}:${item.tmdbId}`),
    ),
  };
}

export async function applyExcludeTracked<T extends MediaSearchResult>(
  result: T,
  excludeTracked: boolean,
  trackedKeys?: Set<string>,
): Promise<T> {
  if (!excludeTracked) return result;

  const tracked = trackedKeys ?? await getTrackedMediaKeys();
  return filterExcludedTracked(result, tracked);
}
