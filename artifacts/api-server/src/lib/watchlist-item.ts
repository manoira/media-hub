import type { watchlistTable } from "@workspace/db";

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
    backdropPath: item.backdropPath ?? null,
    releaseDate: item.releaseDate ?? null,
    originalLanguage: item.originalLanguage ?? null,
    voteAverage: item.voteAverage ?? null,
    genreIds: (item.genreIds ?? []).map(Number),
    keywordIds: item.keywordIds ?? [],
    overview: item.overview ?? null,
  };
}
