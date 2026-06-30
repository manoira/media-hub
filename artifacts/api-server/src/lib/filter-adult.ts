import { isBlockedAdultContent } from "@workspace/content-filter";

type AdultItem = { adult?: boolean | null; originalLanguage?: string | null; title?: string | null; originalTitle?: string | null; overview?: string | null; genreIds?: number[] | null; voteCount?: number | null };
type AdultSearchResult = { results: AdultItem[] };

/** Query booleans must not use z.coerce.boolean() — String("false") is truthy in JS. */
export function parseExcludeAdultFromQuery(
  query: Record<string, unknown>,
): boolean {
  const raw = query.exclude_adult;
  if (raw === undefined || raw === null || raw === "") return true;
  if (typeof raw === "boolean") return raw;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return normalized === "true" || normalized === "1";
}

export function applyExcludeAdult<T extends AdultSearchResult>(
  result: T,
  excludeAdult: boolean,
): T {
  if (!excludeAdult) return result;
  return {
    ...result,
    results: result.results.filter((item) => !isBlockedAdultContent(item, true)),
  };
}

export function isAdultItem(item: AdultItem): boolean {
  return isBlockedAdultContent(item, true);
}
