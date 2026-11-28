import { pgTable, serial, integer, text, real, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  status: text("status").notNull(),
  userRating: real("user_rating"),
  notes: text("notes"),
  title: text("title").notNull(),
  posterPath: text("poster_path"),
  backdropPath: text("backdrop_path"),
  releaseDate: text("release_date"),
  originalLanguage: text("original_language"),
  adult: boolean("adult"),
  voteAverage: real("vote_average"),
  overview: text("overview"),
  genreIds: text("genre_ids").array(),
  keywordIds: integer("keyword_ids").array(),
  tags: text("tags").array(),
  imdbId: text("imdb_id"),
  simklId: text("simkl_id"),
  productionCountries: text("production_countries").array(),
  runtimeMinutes: integer("runtime_minutes"),
  metadataFetchedAt: timestamp("metadata_fetched_at", { withTimezone: true }),
  metadataAttemptedAt: timestamp("metadata_attempted_at", { withTimezone: true }),
  metadataAttemptCount: integer("metadata_attempt_count").notNull().default(0),
  metadataLastError: text("metadata_last_error"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  uniqueMedia: unique("watchlist_media_tmdb_uidx").on(table.mediaType, table.tmdbId),
}));

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, addedAt: true, updatedAt: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistTable.$inferSelect;
