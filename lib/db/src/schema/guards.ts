import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { customListsTable } from "./custom-lists";

export const listExportLocksTable = pgTable("list_export_locks", {
  listId: integer("list_id").primaryKey().references(() => customListsTable.id, { onDelete: "cascade" }),
  owner: text("owner"),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginFailuresTable = pgTable("login_failures", {
  subjectHash: text("subject_hash").primaryKey(),
  failureCount: integer("failure_count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
