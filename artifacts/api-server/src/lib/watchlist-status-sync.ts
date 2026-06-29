import { db, watchlistTable, episodeProgressTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getTvDetails } from "./tmdb";
import { expectsMoreSeasons, isSeriesComplete } from "./tv-show-status";

type WatchlistStatus = "watching" | "watched" | "want_to_watch" | "unsure" | "waiting";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isSeasonAired(airDate: string | null | undefined): boolean {
  if (!airDate) return true;
  return airDate <= todayIsoDate();
}

function countAiredEpisodes(tvDetails: Awaited<ReturnType<typeof getTvDetails>>): number {
  return (tvDetails.seasons ?? [])
    .filter((s) => s.seasonNumber > 0 && isSeasonAired(s.airDate))
    .reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
}

export async function syncWatchlistStatusFromProgress(tmdbId: number): Promise<void> {
  const [entry] = await db
    .select()
    .from(watchlistTable)
    .where(and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, "tv")))
    .limit(1);

  if (!entry) return;

  const [progressRows, tvDetails] = await Promise.all([
    db.select().from(episodeProgressTable).where(eq(episodeProgressTable.tmdbId, tmdbId)),
    getTvDetails(tmdbId),
  ]);

  const watchedCount = progressRows.length;
  const airedEpisodeCount = countAiredEpisodes(tvDetails);
  const currentStatus = entry.status as WatchlistStatus;
  let nextStatus: WatchlistStatus | null = null;

  if (watchedCount > 0 && currentStatus === "want_to_watch") {
    nextStatus = "watching";
  } else if (currentStatus === "waiting" && airedEpisodeCount > 0 && watchedCount < airedEpisodeCount) {
    nextStatus = "watching";
  } else if (airedEpisodeCount > 0 && watchedCount >= airedEpisodeCount) {
    const tmdbStatus = tvDetails.status;
    if (expectsMoreSeasons(tmdbStatus)) {
      if (currentStatus === "watching" || currentStatus === "want_to_watch") {
        nextStatus = "waiting";
      }
    } else if (
      isSeriesComplete(tmdbStatus) &&
      (currentStatus === "watching" || currentStatus === "want_to_watch" || currentStatus === "waiting")
    ) {
      nextStatus = "watched";
    }
  }

  if (nextStatus && nextStatus !== currentStatus) {
    await db
      .update(watchlistTable)
      .set({ status: nextStatus })
      .where(eq(watchlistTable.id, entry.id));
  }
}
