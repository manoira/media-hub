type AdultItem = { adult?: boolean | null };
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
    results: result.results.filter((item) => item.adult !== true),
  };
}

export function isAdultItem(item: { adult?: boolean | null }): boolean {
  return item.adult === true;
}
