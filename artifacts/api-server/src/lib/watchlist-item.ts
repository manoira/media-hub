import type { watchlistTable } from "@workspace/db";
import { clipCardOverview } from "./card-overview";

export function serializeWatchlistItem(item: typeof watchlistTable.$inferSelect) {
  return {
    id: item.id,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType as "movie" | "tv",
    status: item.status as "watching" | "watched" | "want_to_watch" | "unsure" | "waiting",
    userRating: item.userRating ?? null,
    notes: item.notes ?? null,
    addedAt: item.addedAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    title: item.title,
    posterPath: item.posterPath ?? null,
    backdropPath: null,
    releaseDate: item.releaseDate ?? null,
    originalLanguage: item.originalLanguage ?? null,
    adult: item.adult ?? null,
    voteAverage: item.voteAverage ?? null,
    genreIds: (item.genreIds ?? []).map(Number),
    keywordIds: [] as number[],
    tags: item.tags ?? [],
    overview: clipCardOverview(item.overview),
  };
}
