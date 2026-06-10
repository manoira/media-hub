import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const episodeProgressTable = pgTable("episode_progress", {
  id: serial("id").primaryKey(),
  tmdbId: integer("tmdb_id").notNull(),
  seasonNumber: integer("season_number").notNull(),
  episodeNumber: integer("episode_number").notNull(),
  watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueEpisode: unique().on(table.tmdbId, table.seasonNumber, table.episodeNumber),
}));

export const insertEpisodeProgressSchema = createInsertSchema(episodeProgressTable).omit({ id: true, watchedAt: true });
export type InsertEpisodeProgress = z.infer<typeof insertEpisodeProgressSchema>;
export type EpisodeProgress = typeof episodeProgressTable.$inferSelect;
