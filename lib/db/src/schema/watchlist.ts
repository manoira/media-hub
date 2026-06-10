import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";
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
  voteAverage: real("vote_average"),
  overview: text("overview"),
  genreIds: text("genre_ids").array(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, addedAt: true, updatedAt: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistTable.$inferSelect;
