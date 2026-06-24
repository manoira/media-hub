import type {
  GetWatchlistParams,
  GetWatchlistSortBy,
  GetWatchlistStatusItem,
  GetWatchlistTypeItem,
  WatchlistItem,
} from "@workspace/api-client-react";
import {
  decodeYearRange,
  encodeYearRange,
  WATCHLIST_SORT_OPTIONS,
  type WatchlistSortBy,
  type YearRange,
} from "./browse-filters";

export type WatchlistFilterState = {
  sortBy: WatchlistSortBy;
  statuses: GetWatchlistStatusItem[];
  mediaType?: GetWatchlistTypeItem;
  genres: number[];
  yearRanges: YearRange[];
  minRatings: number[];
  languages: string[];
};

const DEFAULT_SORT: WatchlistSortBy = "added_at";
const VALID_SORTS = new Set<string>(WATCHLIST_SORT_OPTIONS.map(o => o.value));
const VALID_STATUSES = new Set<string>(["watching", "watched", "want_to_watch"]);
const VALID_TYPES = new Set<string>(["movie", "tv"]);

export function defaultWatchlistFilters(): WatchlistFilterState {
  return {
    sortBy: DEFAULT_SORT,
    statuses: [],
    mediaType: undefined,
    genres: [],
    yearRanges: [],
    minRatings: [],
    languages: [],
  };
}

export function parseWatchlistSearch(search: string | URLSearchParams): WatchlistFilterState {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  const state = defaultWatchlistFilters();

  const rawSort = params.get("sort") ?? params.get("sort_by");
  if (rawSort && VALID_SORTS.has(rawSort)) {
    state.sortBy = rawSort as WatchlistSortBy;
  }

  for (const status of params.getAll("status")) {
    if (VALID_STATUSES.has(status)) {
      state.statuses.push(status as GetWatchlistStatusItem);
    }
  }

  const typeParam = params.get("type");
  if (typeParam && VALID_TYPES.has(typeParam)) {
    state.mediaType = typeParam as GetWatchlistTypeItem;
  }

  for (const genre of params.getAll("genre")) {
    const id = parseInt(genre, 10);
    if (!Number.isNaN(id)) state.genres.push(id);
  }

  for (const encoded of params.getAll("year_range")) {
    const range = decodeYearRange(encoded);
    if (range) state.yearRanges.push(range);
  }

  for (const rating of params.getAll("min_rating")) {
    const value = parseFloat(rating);
    if (!Number.isNaN(value)) state.minRatings.push(value);
  }

  for (const language of params.getAll("language")) {
    if (language) state.languages.push(language);
  }

  return state;
}

export function buildWatchlistSearchParams(state: WatchlistFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.sortBy !== DEFAULT_SORT) {
    params.set("sort", state.sortBy);
  }

  for (const status of state.statuses) {
    params.append("status", status);
  }

  if (state.mediaType) {
    params.set("type", state.mediaType);
  }

  for (const genre of state.genres) {
    params.append("genre", String(genre));
  }

  for (const range of state.yearRanges) {
    const encoded = encodeYearRange(range);
    if (encoded) params.append("year_range", encoded);
  }

  for (const rating of state.minRatings) {
    params.append("min_rating", String(rating));
  }

  for (const language of state.languages) {
    params.append("language", language);
  }

  return params;
}

export function buildWatchlistSearch(state: WatchlistFilterState): string {
  const query = buildWatchlistSearchParams(state).toString();
  return query ? `?${query}` : "";
}

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

export function filterWatchlistItems(
  items: WatchlistItem[],
  state: WatchlistFilterState,
): WatchlistItem[] {
  return items.filter((item) => {
    if (state.statuses.length > 0 && !state.statuses.includes(item.status)) {
      return false;
    }

    if (state.mediaType && item.mediaType !== state.mediaType) {
      return false;
    }

    if (state.genres.length > 0) {
      const genreIds = item.genreIds ?? [];
      if (!state.genres.some(genreId => genreIds.includes(genreId))) {
        return false;
      }
    }

    if (state.minRatings.length > 0) {
      const threshold = Math.min(...state.minRatings);
      if ((item.voteAverage ?? 0) < threshold) {
        return false;
      }
    }

    if (state.yearRanges.length > 0) {
      const year = releaseYear(item.releaseDate);
      if (
        year === null ||
        !state.yearRanges.some(range => matchesYearRange(year, range))
      ) {
        return false;
      }
    }

    if (state.languages.length > 0) {
      if (
        item.originalLanguage &&
        !state.languages.includes(item.originalLanguage)
      ) {
        return false;
      }
    }

    return true;
  });
}

export function toWatchlistApiParams(state: WatchlistFilterState): GetWatchlistParams {
  const params: GetWatchlistParams = {
    sort_by: state.sortBy as GetWatchlistSortBy,
  };

  if (state.statuses.length > 0) {
    params.status = state.statuses;
  }

  if (state.mediaType) {
    params.type = [state.mediaType];
  }

  if (state.genres.length > 0) {
    params.genre = state.genres;
  }

  const yearRanges = state.yearRanges
    .map(encodeYearRange)
    .filter((v): v is string => v !== null);
  if (yearRanges.length > 0) {
    params.year_range = yearRanges;
  }

  if (state.minRatings.length > 0) {
    params.min_rating = state.minRatings;
  }

  if (state.languages.length > 0) {
    params.language = state.languages;
  }

  return params;
}

export function hasActiveWatchlistFilters(state: WatchlistFilterState): boolean {
  return (
    state.statuses.length > 0 ||
    state.mediaType !== undefined ||
    state.genres.length > 0 ||
    state.yearRanges.length > 0 ||
    state.minRatings.length > 0 ||
    state.languages.length > 0
  );
}
