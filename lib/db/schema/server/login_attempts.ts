import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const login_attempts = sqliteTable("login_attempts", {
  ip: text("ip").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  window_start: text("window_start").notNull(),
});
