import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

type DrizzleDb = ReturnType<typeof drizzle>;
const g = globalThis as { _sqlite?: Database.Database; _db?: DrizzleDb };

// Lazy — not called at module load time so next build does not open the
// database while collecting route metadata across parallel workers.
export function getDb(): DrizzleDb {
  if (!g._sqlite) {
    g._sqlite = new Database(process.env.DB_PATH ?? "./gleaned.db");
    // busy_timeout before journal_mode to avoid SQLITE_BUSY during WAL switch.
    g._sqlite.pragma("busy_timeout = 5000");
    g._sqlite.pragma("journal_mode = WAL");
    g._sqlite.pragma("synchronous = NORMAL");
    g._sqlite.pragma("foreign_keys = ON");
    g._db = drizzle({ client: g._sqlite });
    // Auto-migrate: creates tables on first run (dev server, CI, fresh deploy).
    // Idempotent — drizzle tracks applied migrations in __drizzle_migrations.
    migrate(g._db, {
      migrationsFolder: path.join(process.cwd(), "lib/db/migrations"),
    });
  }
  return g._db!;
}
