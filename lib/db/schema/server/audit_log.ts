import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditLog = sqliteTable("audit_log", {
  id:     integer("id").primaryKey({ autoIncrement: true }),
  ts:     text("ts").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull().default("{}"),
});

export type AuditLogRow = typeof auditLog.$inferSelect;
