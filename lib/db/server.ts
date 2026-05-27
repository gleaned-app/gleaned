import Database from "better-sqlite3";

const g = globalThis as { _db?: Database.Database };

export const db =
  g._db ?? new Database(process.env.DB_PATH ?? "./gleaned.db");

if (!g._db) {
  g._db = db;
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
}
