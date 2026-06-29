import {
  db,
  watchlistTable,
  notificationsTable,
  notificationMetaTable,
  notificationSyncStateTable,
} from "@workspace/db";
import { eq, isNull, and, sql } from "drizzle-orm";
import { getTvDetails, getWatchProviders } from "./tmdb";

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const STREAMING_COUNTRY = "SE";

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

export async function syncNotifications(force = false): Promise<void> {
  const [syncState] = await db.select().from(notificationSyncStateTable).limit(1);
  const lastSync = syncState?.lastSyncAt?.getTime() ?? 0;
  if (!force && Date.now() - lastSync < SYNC_INTERVAL_MS) return;

  const watchlist = await db.select().from(watchlistTable);

  const watchingTv = watchlist.filter(
    (item) => item.mediaType === "tv" && item.status === "watching",
  );
  const wantToWatch = watchlist.filter((item) => item.status === "want_to_watch");

  for (const item of watchingTv) {
    try {
      await checkNewSeasons(item);
    } catch {
      // Skip TMDB failures for individual items
    }
  }

  for (const item of wantToWatch) {
    try {
      await checkLaunchDate(item);
      await checkStreamingAvailable(item);
    } catch {
      // Skip TMDB failures for individual items
    }
  }

  if (syncState) {
    await db
      .update(notificationSyncStateTable)
      .set({ lastSyncAt: new Date() })
      .where(eq(notificationSyncStateTable.id, 1));
  } else {
    await db
      .insert(notificationSyncStateTable)
      .values({ id: 1, lastSyncAt: new Date() })
      .onConflictDoUpdate({
        target: notificationSyncStateTable.id,
        set: { lastSyncAt: new Date() },
      });
  }
}

export async function listNotifications() {
  return db
    .select()
    .from(notificationsTable)
    .orderBy(sql`${notificationsTable.createdAt} DESC`);
}

export async function getUnreadCount(): Promise<number> {
  const rows = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(isNull(notificationsTable.readAt));
  return rows.length;
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
