import {
  getTrendingAll,
  getTrendingType,
  getGenres,
  getPopular,
  getTopRated,
  getNowPlaying,
  getUpcoming,
  getOnAir,
} from "./tmdb";
import { applyExcludeAdult } from "./filter-adult";
import { filterExcludedTracked } from "./exclude-tracked";
import { getCachedWatchlistSnapshot } from "./watchlist-cache";
import { getWatchlistBasedRecommendations } from "./watchlist-recommendations";

type HomeCard = {
  mediaType: string;
  tmdbId: number;
  adult?: boolean | null;
  originalLanguage?: string | null;
  title?: string | null;
  originalTitle?: string | null;
  overview?: string | null;
  genreIds?: number[] | null;
  voteCount?: number | null;
};

type HomePage = {
  results: HomeCard[];
  totalResults: number;
  totalPages: number;
  page: number;
};

function applyHomeFilters<T extends HomePage>(
  result: T,
  tracked: Set<string>,
  excludeTracked: boolean,
  excludeAdult: boolean,
): T {
  let filtered = result;
  if (excludeTracked) {
    filtered = filterExcludedTracked(filtered, tracked);
  }
  return applyExcludeAdult(filtered, excludeAdult);
}

export async function buildHomeFeed(options: {
  type: "all" | "movie" | "tv";
  timeWindow: "day" | "week";
  excludeTracked: boolean;
  excludeAdult: boolean;
}) {
  const { type, timeWindow, excludeTracked, excludeAdult } = options;
  const snapshot = excludeTracked
    ? await getCachedWatchlistSnapshot()
    : null;
  const tracked = snapshot?.keys ?? new Set<string>();

  const [
    trendingRaw,
    genres,
    popularMoviesRaw,
    popularTvRaw,
    topRatedMoviesRaw,
    topRatedTvRaw,
    nowPlayingRaw,
    upcomingRaw,
    onAirRaw,
    recommendationsRaw,
  ] = await Promise.all([
    type === "all" ? getTrendingAll(timeWindow) : getTrendingType(type, timeWindow),
    getGenres(),
    getPopular("movie"),
    getPopular("tv"),
    getTopRated("movie"),
    getTopRated("tv"),
    getNowPlaying(),
    getUpcoming(),
    getOnAir(),
    getWatchlistBasedRecommendations(snapshot?.rows),
  ]);

  return {
    trending: applyHomeFilters(trendingRaw, tracked, excludeTracked, excludeAdult),
    genres,
    popularMovies: applyHomeFilters(popularMoviesRaw, tracked, excludeTracked, excludeAdult),
    popularTv: applyHomeFilters(popularTvRaw, tracked, excludeTracked, excludeAdult),
    topRatedMovies: applyHomeFilters(topRatedMoviesRaw, tracked, excludeTracked, excludeAdult),
    topRatedTv: applyHomeFilters(topRatedTvRaw, tracked, excludeTracked, excludeAdult),
    nowPlaying: applyHomeFilters(nowPlayingRaw, tracked, excludeTracked, excludeAdult),
    upcoming: applyHomeFilters(upcomingRaw, tracked, excludeTracked, excludeAdult),
    onAir: applyHomeFilters(onAirRaw, tracked, excludeTracked, excludeAdult),
    watchlistRecommendations: applyHomeFilters(
      recommendationsRaw,
      tracked,
      excludeTracked,
      excludeAdult,
    ),
  };
}
