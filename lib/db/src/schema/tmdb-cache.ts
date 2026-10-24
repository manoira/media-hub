import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tmdbCacheTable = pgTable("tmdb_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  staleUntil: timestamp("stale_until", { withTimezone: true }).notNull(),
});

export const tmdbMeterTable = pgTable("tmdb_meter", {
  surface: text("surface").primaryKey(),
  hits: integer("hits").notNull().default(0),
  misses: integer("misses").notNull().default(0),
  stale: integer("stale").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  external: integer("external").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
});
