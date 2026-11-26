import { db, watchlistTable, episodeProgressTable, watchEventsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { countAiredTvProgress, resolveProgressStatus } from "./aired-tv-progress";
import { getTvDetails } from "./tmdb";
import { invalidateWatchlistCache } from "./watchlist-cache";

export async function syncWatchlistStatusFromProgress(tmdbId: number): Promise<void> {
  const match = and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, "tv"));
  const [tracked] = await db.select({ id: watchlistTable.id }).from(watchlistTable).where(match);
  if (!tracked) return;

  const details = await getTvDetails(tmdbId).catch(() => null);
  if (!details) return;

  const changed = await db.transaction(async tx => {
    const [entry] = await tx.select().from(watchlistTable).where(match).for("update");
    if (!entry) return false;

    const rows = await tx.select().from(episodeProgressTable).where(eq(episodeProgressTable.tmdbId, tmdbId));
    const progress = countAiredTvProgress(details.airedSchedule, rows);
    const next = resolveProgressStatus(entry.status, details.airedSchedule, progress, rows.some(row => row.seasonNumber > 0));
    if (entry.status === next) return false;

    const now = new Date();
    await tx.update(watchlistTable).set({ status: next, statusChangedAt: now }).where(eq(watchlistTable.id, entry.id));
    if ((entry.status === "watched") !== (next === "watched")) {
      await tx.insert(watchEventsTable).values({ tmdbId, mediaType: "tv", action: next === "watched" ? "watched" : "unwatched", occurredAt: now });
    }
    return true;
  });
  if (changed) invalidateWatchlistCache();
}
