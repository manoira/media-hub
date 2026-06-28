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

export function evaluateListRules(items: Watchlist[], rules: ListRules | null | undefined): Watchlist[] {
  if (!rules) return items;

  return items.filter((item) => {
    if (rules.mediaType && item.mediaType !== rules.mediaType) {
      return false;
    }

    if (rules.statuses?.length && !rules.statuses.includes(item.status as typeof rules.statuses[number])) {
      return false;
    }

    if (rules.genreIds?.length) {
      const genreIds = (item.genreIds ?? []).map(Number);
      if (!rules.genreIds.some(id => genreIds.includes(id))) {
        return false;
      }
    }

    if (rules.languages?.length) {
      if (!item.originalLanguage || !rules.languages.includes(item.originalLanguage)) {
        return false;
      }
    }

    if (rules.keywordIds?.length) {
      const keywordIds = item.keywordIds ?? [];
      if (!rules.keywordIds.some(id => keywordIds.includes(id))) {
        return false;
      }
    }

    if (rules.minRatings?.length) {
      const threshold = Math.min(...rules.minRatings);
      if ((item.voteAverage ?? 0) < threshold) {
        return false;
      }
    }

    if (rules.yearRanges?.length) {
      const year = releaseYear(item.releaseDate);
      if (
        year === null ||
        !rules.yearRanges.some(range => matchesYearRange(year, range))
      ) {
        return false;
      }
    }

    return true;
  });
}
