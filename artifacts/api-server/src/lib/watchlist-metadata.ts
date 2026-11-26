import { acceptImdbId } from "@workspace/db";
import type { getMovieDetails, getTvDetails } from "./tmdb";

export function watchlistMetadata(
  tmdbId: number,
  details: Awaited<ReturnType<typeof getMovieDetails | typeof getTvDetails>>,
) {
  return {
    title: details.title,
    posterPath: details.posterPath,
    backdropPath: details.backdropPath,
    releaseDate: details.releaseDate,
    originalLanguage: details.originalLanguage,
    adult: details.adult,
    voteAverage: details.voteAverage,
    overview: details.overview,
    genreIds: details.genres.map(g => String(g.id)),
    productionCountries: details.productionCountryCodes,
    runtimeMinutes: details.runtime,
    imdbId: acceptImdbId({
      requestedTmdbId: tmdbId,
      returnedTmdbId: details.tmdbId,
      imdbId: details.imdbId,
    }),
  };
}
