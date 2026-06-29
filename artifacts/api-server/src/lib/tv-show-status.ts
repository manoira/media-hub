/** TMDB TV show lifecycle status values (see show detail → Status). */
export function isReturningTvShow(tmdbStatus: string | null | undefined): boolean {
  return tmdbStatus === "Returning Series";
}

export function isFinishedTvShow(tmdbStatus: string | null | undefined): boolean {
  if (!tmdbStatus) return false;
  const s = tmdbStatus.toLowerCase();
  return s === "ended" || s === "canceled" || s === "cancelled";
}

/** True when a caught-up show should stay on the watchlist waiting for more. */
export function expectsMoreSeasons(tmdbStatus: string | null | undefined): boolean {
  return isReturningTvShow(tmdbStatus);
}

/** True when TMDB indicates the series is complete. */
export function isSeriesComplete(tmdbStatus: string | null | undefined): boolean {
  return isFinishedTvShow(tmdbStatus);
}
