import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey(),
    done: integer("done").notNull().default(0),
    due_date: text("due_date"),
    color: text("color"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    data_enc: blob("data_enc", { mode: "buffer" }).notNull(),
  },
  (t) => [index("threads_due").on(t.done, t.due_date)],
);

export type ThreadRow = typeof threads.$inferSelect;
export type NewThreadRow = typeof threads.$inferInsert;
