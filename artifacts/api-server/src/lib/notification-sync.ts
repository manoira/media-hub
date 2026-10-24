import {
  db,
  pool,
  watchlistTable,
  notificationsTable,
  notificationMetaTable,
  notificationSyncStateTable,
} from "@workspace/db";
import { eq, isNull, sql } from "drizzle-orm";
import { getTvDetails, getWatchProviders } from "./tmdb";
import { withTmdbSurface } from "./tmdb-cache";
import { isTmdbBudgetError, MANUAL_TMDB_DAILY_LIMIT, remainingManualTmdbBudget, withManualTmdbBudget } from "./tmdb-budget";

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const STREAMING_COUNTRY = "SE";
const CHECKS_PER_RUN = 20;
let notificationSyncActive = false;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isSeasonAired(airDate: string | null | undefined): boolean {
  if (!airDate) return false;
  return airDate <= todayIsoDate();
}

function hasStreamingProviders(
  providers: Awaited<ReturnType<typeof getWatchProviders>>,
): boolean {
  return (
    providers.flatrate.length > 0 ||
    providers.rent.length > 0 ||
    providers.buy.length > 0 ||
    providers.free.length > 0
  );
}

async function getMeta(watchlistId: number) {
  const [row] = await db
    .select()
    .from(notificationMetaTable)
    .where(eq(notificationMetaTable.watchlistId, watchlistId))
    .limit(1);
  return row ?? null;
}

async function upsertMeta(
  watchlistId: number,
  patch: Partial<{
    lastNotifiedSeason: number | null;
    hadStreaming: boolean | null;
    launchNotified: boolean;
  }>,
) {
  const existing = await getMeta(watchlistId);
  if (existing) {
    await db
      .update(notificationMetaTable)
      .set(patch)
      .where(eq(notificationMetaTable.watchlistId, watchlistId));
  } else {
    await db.insert(notificationMetaTable).values({
      watchlistId,
      lastNotifiedSeason: patch.lastNotifiedSeason ?? null,
      hadStreaming: patch.hadStreaming ?? null,
      launchNotified: patch.launchNotified ?? false,
    });
  }
}

async function insertNotification(input: {
  dedupeKey: string;
  kind: string;
  title: string;
  message: string;
  tmdbId: number;
  mediaType: string;
  posterPath: string | null;
}) {
  await db
    .insert(notificationsTable)
    .values(input)
    .onConflictDoNothing({ target: notificationsTable.dedupeKey });
}

async function checkNewSeasons(
  item: typeof watchlistTable.$inferSelect,
): Promise<void> {
  const tv = await getTvDetails(item.tmdbId);
  const airedSeasons = (tv.seasons ?? []).filter(
    (s) => s.seasonNumber > 0 && isSeasonAired(s.airDate),
  );
  const maxAiredSeason = airedSeasons.reduce(
    (max, s) => Math.max(max, s.seasonNumber),
    0,
  );
  const meta = await getMeta(item.id);

  if (meta?.lastNotifiedSeason == null) {
    await upsertMeta(item.id, { lastNotifiedSeason: maxAiredSeason });
    return;
  }

  if (maxAiredSeason <= meta.lastNotifiedSeason) return;

  for (const season of airedSeasons.filter(
    (s) => s.seasonNumber > meta.lastNotifiedSeason!,
  )) {
    await insertNotification({
      dedupeKey: `new_season:${item.mediaType}:${item.tmdbId}:${season.seasonNumber}`,
      kind: "new_season",
      title: item.title,
      message: `Season ${season.seasonNumber} of ${item.title} is now available.`,
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      posterPath: item.posterPath ?? null,
    });
  }

  await upsertMeta(item.id, { lastNotifiedSeason: maxAiredSeason });
}

async function checkStreamingAvailable(
  item: typeof watchlistTable.$inferSelect,
): Promise<void> {
  const providers = await getWatchProviders(item.mediaType, item.tmdbId, STREAMING_COUNTRY);
  const hasStreaming = hasStreamingProviders(providers);
  const meta = await getMeta(item.id);

  if (meta?.hadStreaming == null) {
    await upsertMeta(item.id, { hadStreaming: hasStreaming });
    return;
  }

  if (!meta.hadStreaming && hasStreaming) {
    const providerNames = [
      ...providers.flatrate,
      ...providers.free,
      ...providers.rent,
    ]
      .slice(0, 3)
      .map((p) => p.providerName)
      .join(", ");

    await insertNotification({
      dedupeKey: `streaming:${item.mediaType}:${item.tmdbId}`,
      kind: "streaming_available",
      title: item.title,
      message: providerNames
        ? `${item.title} is now available to stream (${providerNames}).`
        : `${item.title} is now available on a streaming service.`,
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      posterPath: item.posterPath ?? null,
    });
    await upsertMeta(item.id, { hadStreaming: true });
  } else if (meta.hadStreaming !== hasStreaming) {
    await upsertMeta(item.id, { hadStreaming: hasStreaming });
  }
}

async function checkLaunchDate(
  item: typeof watchlistTable.$inferSelect,
): Promise<void> {
  const releaseDate = item.releaseDate?.slice(0, 10);
  if (!releaseDate) return;

  const meta = await getMeta(item.id);

  if (releaseDate > todayIsoDate()) {
    if (!meta) await upsertMeta(item.id, { launchNotified: false });
    return;
  }

  if (meta?.launchNotified) return;

  if (!meta) {
    await upsertMeta(item.id, { launchNotified: true });
    return;
  }

  await insertNotification({
    dedupeKey: `launch:${item.mediaType}:${item.tmdbId}`,
    kind: "launch",
    title: item.title,
    message: `${item.title} has been released.`,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    posterPath: item.posterPath ?? null,
  });
  await upsertMeta(item.id, { launchNotified: true });
}

export function notificationSyncInProgress(): boolean {
  return notificationSyncActive;
}

export type NotificationSyncResult = {
  skipped: "busy" | "interval" | "budget" | null;
  checked: number;
  remaining: number;
  limit: number;
};

async function syncResult(
  skipped: NotificationSyncResult["skipped"],
  checked: number,
): Promise<NotificationSyncResult> {
  const remaining = await remainingManualTmdbBudget().catch(() => 0);
  return { skipped, checked, remaining, limit: MANUAL_TMDB_DAILY_LIMIT };
}

export async function demonstrateNotificationLock(): Promise<{ skipped: "busy" | "interval" | "budget" | null }> {
  notificationSyncActive = true;
  try {
    const result = await syncNotifications(false);
    return { skipped: result.skipped };
  } finally {
    notificationSyncActive = false;
  }
}

export async function syncNotifications(force = false): Promise<NotificationSyncResult> {
  if (notificationSyncActive) return syncResult("busy", 0);
  const remainingBefore = await remainingManualTmdbBudget().catch(() => 0);
  if (remainingBefore <= 0) return syncResult("budget", 0);
  notificationSyncActive = true;
  try {
    const [syncState] = await db.select().from(notificationSyncStateTable).limit(1);
    const lastSync = syncState?.lastSyncAt?.getTime() ?? 0;
    if (!force && Date.now() - lastSync < SYNC_INTERVAL_MS) return syncResult("interval", 0);

    const watchlist = await db.select().from(watchlistTable);
    const watchingTv = watchlist.filter((item) => item.mediaType === "tv" && item.status === "watching");
    const wantToWatch = watchlist.filter((item) => item.status === "want_to_watch");
    const cursor = syncState?.cursorOffset ?? 0;
    const tvBatch = watchingTv.slice(cursor, cursor + CHECKS_PER_RUN);
    const watchBatch = wantToWatch.slice(cursor, cursor + CHECKS_PER_RUN);
    let checked = 0;
    let budgetHit = false;

    await withManualTmdbBudget(() => withTmdbSurface("notifications", async () => {
      for (const item of tvBatch) {
        if (budgetHit) break;
        checked += 1;
        try {
          await checkNewSeasons(item);
        } catch (error) {
          if (isTmdbBudgetError(error)) budgetHit = true;
        }
      }
      for (const item of watchBatch) {
        if (budgetHit) break;
        checked += 1;
        try {
          await checkLaunchDate(item);
          await checkStreamingAvailable(item);
        } catch (error) {
          if (isTmdbBudgetError(error)) budgetHit = true;
        }
      }
    }));

    const nextCursor = Math.max(watchingTv.length, wantToWatch.length);
    const advanced = nextCursor === 0 ? 0 : (cursor + CHECKS_PER_RUN) % nextCursor;
    if (syncState) {
      await db
        .update(notificationSyncStateTable)
        .set({ lastSyncAt: new Date(), cursorOffset: advanced })
        .where(eq(notificationSyncStateTable.id, 1));
    } else {
      await db
        .insert(notificationSyncStateTable)
        .values({ id: 1, lastSyncAt: new Date(), cursorOffset: advanced })
        .onConflictDoUpdate({
          target: notificationSyncStateTable.id,
          set: { lastSyncAt: new Date(), cursorOffset: advanced },
        });
    }
    return syncResult(budgetHit ? "budget" : null, checked);
  } finally {
    notificationSyncActive = false;
  }
}

export async function listNotifications() {
  return db
    .select()
    .from(notificationsTable)
    .orderBy(sql`${notificationsTable.createdAt} DESC`);
}

export async function getUnreadCount(): Promise<number> {
  const found = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM notifications WHERE read_at IS NULL",
  );
  return found.rows[0]?.count ?? 0;
}

export async function markAllNotificationsRead(): Promise<void> {
  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(isNull(notificationsTable.readAt));
}

export function serializeNotification(row: typeof notificationsTable.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind as "new_season" | "streaming_available" | "launch",
    title: row.title,
    message: row.message,
    tmdbId: row.tmdbId,
    mediaType: row.mediaType as "movie" | "tv",
    posterPath: row.posterPath ?? null,
    read: row.readAt != null,
    createdAt: row.createdAt.toISOString(),
  };
}
