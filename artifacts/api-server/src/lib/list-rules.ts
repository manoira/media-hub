import type { Watchlist } from "@workspace/db";
import type { ListRules } from "@workspace/db";

type YearRange = { min?: number; max?: number };

function releaseYear(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const year = parseInt(releaseDate.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function matchesYearRange(year: number, range: YearRange): boolean {
  if (range.min !== undefined && year < range.min) return false;
  if (range.max !== undefined && year > range.max) return false;
  return true;
}

export type RuleExplanation = {
  matches: Watchlist[];
  missingCountry: number;
  missingRuntime: number;
  missingUserRating: number;
};

function matchesBaseRules(item: Watchlist, rules: ListRules): boolean {
  if (rules.mediaType && item.mediaType !== rules.mediaType) return false;
  if (rules.statuses?.length && !rules.statuses.includes(item.status as typeof rules.statuses[number])) return false;
  if (rules.genreIds?.length) {
    const genreIds = (item.genreIds ?? []).map(Number);
    if (!rules.genreIds.some((id) => genreIds.includes(id))) return false;
  }
  if (rules.languages?.length) {
    if (!item.originalLanguage || !rules.languages.includes(item.originalLanguage)) return false;
  }
  if (rules.keywordIds?.length) {
    const keywordIds = item.keywordIds ?? [];
    if (!rules.keywordIds.some((id) => keywordIds.includes(id))) return false;
  }
  if (rules.minRatings?.length) {
    const threshold = Math.min(...rules.minRatings);
    if ((item.voteAverage ?? 0) < threshold) return false;
  }
  if (rules.yearRanges?.length) {
    const year = releaseYear(item.releaseDate);
    if (year === null || !rules.yearRanges.some((range) => matchesYearRange(year, range))) return false;
  }
  return true;
}

export function explainListRules(items: Watchlist[], rules: ListRules | null | undefined): RuleExplanation {
  if (!rules) {
    return { matches: items, missingCountry: 0, missingRuntime: 0, missingUserRating: 0 };
  }
  const base = items.filter((item) => matchesBaseRules(item, rules));
  let missingCountry = 0;
  let missingRuntime = 0;
  let missingUserRating = 0;
  const matches = base.filter((item) => {
    if (rules.productionCountries?.length) {
      const countries = item.productionCountries ?? [];
      if (countries.length === 0) {
        missingCountry += 1;
        return false;
      }
      if (!rules.productionCountries.some((code) => countries.includes(code))) return false;
    }
    if (rules.runtimeBelow != null) {
      if (item.runtimeMinutes == null) {
        missingRuntime += 1;
        return false;
      }
      if (item.runtimeMinutes >= rules.runtimeBelow) return false;
    }
    if (rules.minUserRatings?.length) {
      const threshold = Math.min(...rules.minUserRatings);
      if (item.userRating == null) {
        missingUserRating += 1;
        return false;
      }
      if (item.userRating < threshold) return false;
    }
    return true;
  });
  return { matches, missingCountry, missingRuntime, missingUserRating };
}

export function evaluateListRules(items: Watchlist[], rules: ListRules | null | undefined): Watchlist[] {
  return explainListRules(items, rules).matches;
}
