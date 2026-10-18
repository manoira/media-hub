import { pgTable, serial, integer, text, timestamp, jsonb, unique, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { watchlistTable } from "./watchlist";

export const listRulesSchema = z.object({
  mediaType: z.enum(["movie", "tv"]).optional(),
  statuses: z.array(z.enum(["watching", "watched", "want_to_watch", "unsure", "waiting"])).optional(),
  genreIds: z.array(z.number()).optional(),
  languages: z.array(z.string()).optional(),
  keywordIds: z.array(z.number()).optional(),
  minRatings: z.array(z.number()).optional(),
  productionCountries: z.array(z.string()).optional(),
  runtimeBelow: z.number().optional(),
  minUserRatings: z.array(z.number()).optional(),
  yearRanges: z.array(z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  })).optional(),
});

export type ListRules = z.infer<typeof listRulesSchema>;

export const customListsTable = pgTable("custom_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull(), // manual | smart
  smartMode: text("smart_mode"), // live | snapshot | null
  rules: jsonb("rules").$type<ListRules | null>(),
  myListsSlug: text("my_lists_slug"),
  contentHash: text("content_hash"),
  externalVersion: text("external_version"),
  syncStatus: text("sync_status"),
  exportEnabled: boolean("export_enabled").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncError: text("sync_error"),
  syncTarget: text("sync_target"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const customListItemsTable = pgTable("custom_list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => customListsTable.id, { onDelete: "cascade" }),
  watchlistId: integer("watchlist_id").references(() => watchlistTable.id, { onDelete: "set null" }),
  tmdbId: integer("tmdb_id"),
  mediaType: text("media_type"),
  title: text("title"),
  posterPath: text("poster_path"),
  releaseDate: text("release_date"),
  voteAverage: real("vote_average"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueListMedia: unique().on(table.listId, table.tmdbId, table.mediaType),
}));

export const insertCustomListSchema = createInsertSchema(customListsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomList = z.infer<typeof insertCustomListSchema>;
export type CustomList = typeof customListsTable.$inferSelect;

export const insertCustomListItemSchema = createInsertSchema(customListItemsTable).omit({
  id: true,
  addedAt: true,
});
export type InsertCustomListItem = z.infer<typeof insertCustomListItemSchema>;
export type CustomListItem = typeof customListItemsTable.$inferSelect;
