import { pgTable, serial, integer, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { customListsTable } from "./custom-lists";

/** New watch or unwatch actions. Existing history is not backfilled. */
export const watchEventsTable = pgTable("watch_events", {
  id: serial("id").primaryKey(),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  action: text("action").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** SIMKL state, separate from local watch history. */
export const simklMarkersTable = pgTable("simkl_markers", {
  id: serial("id").primaryKey(),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  simklId: text("simkl_id"),
  watched: boolean("watched"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
}, (table) => ({
  uniqueMedia: unique("simkl_markers_media_tmdb_uidx").on(table.mediaType, table.tmdbId),
}));

export const listSyncQueueTable = pgTable("list_sync_queue", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => customListsTable.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueKey: unique("list_sync_queue_idempotency_uidx").on(table.idempotencyKey),
}));
