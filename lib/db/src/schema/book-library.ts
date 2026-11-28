import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bookLibraryTable = pgTable("book_library", {
  id: text("id").primaryKey(),
  document: jsonb("document").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
