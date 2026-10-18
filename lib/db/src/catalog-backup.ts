import { createHash } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
import {
  customListItemsTable,
  customListsTable,
  episodeProgressTable,
  listSyncQueueTable,
  simklMarkersTable,
  watchEventsTable,
  watchlistTable,
} from "./schema";

type Database = NodePgDatabase<typeof schema>;

export type CatalogBackup = {
  exportedAt: string;
  counts: {
    watchlist: number;
    episodeProgress: number;
    customLists: number;
    customListItems: number;
    watchEvents: number;
    simklMarkers: number;
    listSyncQueue: number;
  };
  watchlist: Array<Record<string, unknown>>;
  episodeProgress: Array<Record<string, unknown>>;
  customLists: Array<Record<string, unknown>>;
  customListItems: Array<Record<string, unknown>>;
  watchEvents: Array<Record<string, unknown>>;
  simklMarkers: Array<Record<string, unknown>>;
  listSyncQueue: Array<Record<string, unknown>>;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value) return new Date(value);
  return null;
}

export function listContentHash(items: Array<{ mediaType: string; tmdbId: number }>): string {
  const body = items
    .map((item) => `${item.mediaType}:${item.tmdbId}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Accept an IMDb id only when the lookup was for this TMDB title and the id
 * looks like an IMDb title. A mismatched response is refused, not cached.
 */
export function acceptImdbId(input: {
  requestedTmdbId: number;
  returnedTmdbId: number | null;
  imdbId: string | null;
}): string | null {
  if (input.returnedTmdbId !== input.requestedTmdbId) return null;
  if (!input.imdbId || !/^tt\d{7,}$/.test(input.imdbId)) return null;
  return input.imdbId;
}

export async function readCatalogBackup(database: Database): Promise<CatalogBackup> {
  // Sequential reads keep a transaction on one connection. Parallel queries on that client are unsafe.
  const watchlist = await database.select().from(watchlistTable);
  const episodeProgress = await database.select().from(episodeProgressTable);
  const customLists = await database.select().from(customListsTable);
  const customListItems = await database.select().from(customListItemsTable);
  const watchEvents = await database.select().from(watchEventsTable);
  const simklMarkers = await database.select().from(simklMarkersTable);
  const listSyncQueue = await database.select().from(listSyncQueueTable);

  return {
    exportedAt: new Date().toISOString(),
    counts: {
      watchlist: watchlist.length,
      episodeProgress: episodeProgress.length,
      customLists: customLists.length,
      customListItems: customListItems.length,
      watchEvents: watchEvents.length,
      simklMarkers: simklMarkers.length,
      listSyncQueue: listSyncQueue.length,
    },
    watchlist: watchlist as Array<Record<string, unknown>>,
    episodeProgress: episodeProgress as Array<Record<string, unknown>>,
    customLists: customLists as Array<Record<string, unknown>>,
    customListItems: customListItems as Array<Record<string, unknown>>,
    watchEvents: watchEvents as Array<Record<string, unknown>>,
    simklMarkers: simklMarkers as Array<Record<string, unknown>>,
    listSyncQueue: listSyncQueue as Array<Record<string, unknown>>,
  };
}

export async function restoreCatalog(database: Database, backup: CatalogBackup): Promise<void> {
  await database.delete(listSyncQueueTable);
  await database.delete(customListItemsTable);
  await database.delete(customListsTable);
  await database.delete(watchEventsTable);
  await database.delete(simklMarkersTable);
  await database.delete(episodeProgressTable);
  await database.delete(watchlistTable);

  const watchlistIds = new Map<number, number>();
  if (backup.watchlist.length > 0) {
    const inserted = await database.insert(watchlistTable).values(backup.watchlist.map((row) => ({
      tmdbId: row.tmdbId as number,
      mediaType: row.mediaType as string,
      status: row.status as string,
      userRating: (row.userRating as number | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      title: row.title as string,
      posterPath: (row.posterPath as string | null) ?? null,
      backdropPath: (row.backdropPath as string | null) ?? null,
      releaseDate: (row.releaseDate as string | null) ?? null,
      originalLanguage: (row.originalLanguage as string | null) ?? null,
      adult: (row.adult as boolean | null) ?? null,
      voteAverage: (row.voteAverage as number | null) ?? null,
      overview: (row.overview as string | null) ?? null,
      genreIds: (row.genreIds as string[] | null) ?? [],
      keywordIds: (row.keywordIds as number[] | null) ?? [],
      tags: (row.tags as string[] | null) ?? [],
      imdbId: (row.imdbId as string | null) ?? null,
      simklId: (row.simklId as string | null) ?? null,
      productionCountries: (row.productionCountries as string[] | null) ?? null,
      runtimeMinutes: (row.runtimeMinutes as number | null) ?? null,
      metadataFetchedAt: toDate(row.metadataFetchedAt),
      metadataAttemptedAt: toDate(row.metadataAttemptedAt),
      metadataAttemptCount: typeof row.metadataAttemptCount === "number" ? row.metadataAttemptCount : 0,
      metadataLastError: (row.metadataLastError as string | null) ?? null,
      statusChangedAt: toDate(row.statusChangedAt),
      ...(toDate(row.addedAt) ? { addedAt: toDate(row.addedAt)! } : {}),
      ...(toDate(row.updatedAt) ? { updatedAt: toDate(row.updatedAt)! } : {}),
    }))).returning({ id: watchlistTable.id, tmdbId: watchlistTable.tmdbId, mediaType: watchlistTable.mediaType });

    const byIdentity = new Map(inserted.map((row) => [`${row.mediaType}:${row.tmdbId}`, row.id]));
    for (const row of backup.watchlist) {
      const nextId = byIdentity.get(`${row.mediaType}:${row.tmdbId}`);
      if (typeof row.id === "number" && nextId) watchlistIds.set(row.id, nextId);
    }
  }

  if (backup.episodeProgress.length > 0) {
    await database.insert(episodeProgressTable).values(backup.episodeProgress.map((row) => ({
      tmdbId: row.tmdbId as number,
      seasonNumber: row.seasonNumber as number,
      episodeNumber: row.episodeNumber as number,
      ...(toDate(row.watchedAt) ? { watchedAt: toDate(row.watchedAt)! } : {}),
    })));
  }

  const listIds = new Map<number, number>();
  if (backup.customLists.length > 0) {
    const inserted = await database.insert(customListsTable).values(backup.customLists.map((row) => ({
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      kind: row.kind as string,
      smartMode: (row.smartMode as string | null) ?? null,
      rules: (row.rules as Record<string, unknown> | null) ?? null,
      myListsSlug: (row.myListsSlug as string | null) ?? null,
      contentHash: (row.contentHash as string | null) ?? null,
      externalVersion: (row.externalVersion as string | null) ?? null,
      syncStatus: (row.syncStatus as string | null) ?? null,
      exportEnabled: Boolean(row.exportEnabled),
      lastSyncedAt: toDate(row.lastSyncedAt),
      syncError: (row.syncError as string | null) ?? null,
      syncTarget: (row.syncTarget as string | null) ?? null,
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt)! } : {}),
      ...(toDate(row.updatedAt) ? { updatedAt: toDate(row.updatedAt)! } : {}),
    }))).returning({ id: customListsTable.id });
    backup.customLists.forEach((row, index) => {
      if (typeof row.id === "number") listIds.set(row.id, inserted[index].id);
    });
  }

  if (backup.customListItems.length > 0) {
    await database.insert(customListItemsTable).values(backup.customListItems.map((row) => ({
      listId: listIds.get(row.listId as number) ?? (row.listId as number),
      watchlistId: typeof row.watchlistId === "number" ? watchlistIds.get(row.watchlistId) ?? null : null,
      tmdbId: (row.tmdbId as number | null) ?? null,
      mediaType: (row.mediaType as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      posterPath: (row.posterPath as string | null) ?? null,
      releaseDate: (row.releaseDate as string | null) ?? null,
      voteAverage: (row.voteAverage as number | null) ?? null,
      ...(toDate(row.addedAt) ? { addedAt: toDate(row.addedAt)! } : {}),
    })));
  }

  if (backup.watchEvents.length > 0) {
    await database.insert(watchEventsTable).values(backup.watchEvents.map((row) => ({
      tmdbId: row.tmdbId as number,
      mediaType: row.mediaType as string,
      action: row.action as string,
      occurredAt: toDate(row.occurredAt),
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt)! } : {}),
    })));
  }

  if (backup.simklMarkers.length > 0) {
    await database.insert(simklMarkersTable).values(backup.simklMarkers.map((row) => ({
      tmdbId: row.tmdbId as number,
      mediaType: row.mediaType as string,
      simklId: (row.simklId as string | null) ?? null,
      watched: (row.watched as boolean | null) ?? null,
      syncedAt: toDate(row.syncedAt),
    })));
  }

  if (backup.listSyncQueue.length > 0) {
    await database.insert(listSyncQueueTable).values(backup.listSyncQueue.map((row) => ({
      listId: listIds.get(row.listId as number) ?? (row.listId as number),
      idempotencyKey: row.idempotencyKey as string,
      contentHash: row.contentHash as string,
      status: (row.status as string) ?? "pending",
      ...(toDate(row.createdAt) ? { createdAt: toDate(row.createdAt)! } : {}),
    })));
  }
}

export async function catalogCounts(database: Database): Promise<CatalogBackup["counts"]> {
  const backup = await readCatalogBackup(database);
  return backup.counts;
}

