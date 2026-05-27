import { blob, index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    next_review: text("next_review"),
    review_interval: real("review_interval"),
    data_enc: blob("data_enc", { mode: "buffer" }).notNull(),
  },
  (t) => [
    index("entries_date").on(t.date),
    index("entries_next_review").on(t.next_review),
  ],
);

export type EntryRow = typeof entries.$inferSelect;
export type NewEntryRow = typeof entries.$inferInsert;
