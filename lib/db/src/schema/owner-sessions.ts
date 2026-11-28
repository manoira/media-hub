import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ownerSessionsTable = pgTable("owner_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
