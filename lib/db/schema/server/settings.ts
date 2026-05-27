import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("gleaned_settings"),
  password_verifier: text("password_verifier"),
  encryption_salt: text("encryption_salt"),
  encryption_iterations: integer("encryption_iterations").notNull().default(600_000),
  language: text("language").notNull().default("de"),
  week_start: text("week_start").notNull().default("monday"),
  theme: text("theme").notNull().default("system"),
  body_font: text("body_font").notNull().default("sans"),
  default_view: text("default_view").notNull().default("journal"),
  auto_lock_after_minutes: integer("auto_lock_after_minutes").notNull().default(15),
  custom_entry_types: text("custom_entry_types").notNull().default("[]"),
  context_sources: text("context_sources").notNull().default("[]"),
});

export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;
