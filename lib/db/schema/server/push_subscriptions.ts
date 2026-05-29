import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const push_subscriptions = sqliteTable("push_subscriptions", {
  id:         text("id").primaryKey(),
  endpoint:   text("endpoint").notNull(),
  p256dh:     text("p256dh").notNull(),
  auth_key:   text("auth_key").notNull(),
  lang:       text("lang").notNull().default("en"),
  tz:         text("tz").notNull().default("UTC"),
  created_at: text("created_at").notNull(),
});

export type PushSubscriptionRow    = typeof push_subscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof push_subscriptions.$inferInsert;
