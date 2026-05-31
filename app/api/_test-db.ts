import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";

export type TestDb = ReturnType<typeof drizzle>;

// Creates a fresh in-memory SQLite database with all migrations applied.
// Each test should call this in beforeEach to get a clean slate.
export function createTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
  return db;
}
