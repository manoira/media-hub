import { db, watchlistTable } from "@workspace/db";

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
  const rows = await db
    .select({ tmdbId: watchlistTable.tmdbId, mediaType: watchlistTable.mediaType })
    .from(watchlistTable);
  return new Set(rows.map((row) => `${row.mediaType}:${row.tmdbId}`));
}

export async function applyExcludeTracked<T extends MediaSearchResult>(
  result: T,
  excludeTracked: boolean,
): Promise<T> {
  if (!excludeTracked) return result;

  const tracked = await getTrackedMediaKeys();
  return {
    ...result,
    results: result.results.filter(
      (item) => !tracked.has(`${item.mediaType}:${item.tmdbId}`),
    ),
  };
}
