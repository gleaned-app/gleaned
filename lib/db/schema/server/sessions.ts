import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    created_at: text("created_at").notNull(),
    expires_at: text("expires_at").notNull(),
  },
  (t) => [index("sessions_expires").on(t.expires_at)],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
