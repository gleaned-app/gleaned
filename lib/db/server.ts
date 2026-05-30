import os from "os";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

type DrizzleDb = ReturnType<typeof drizzle>;
const g = globalThis as { _sqlite?: Database.Database; _db?: DrizzleDb };

// When DB_PATH is not set, store the database in the XDG Base Directory
// (~/.local/share/gleaned/gleaned.db) rather than the project root.
//
// Keeping the database outside the repo prevents accidental exposure:
//   - `git add .` cannot pick up the file even if .gitignore is edited
//   - Multiple checkouts of the project share one database
//   - Backup tools targeting ~/.local/share handle data independently of code
//
// In Docker, DB_PATH is always set by the compose file. If it isn't
// (bare `docker run` without compose), the instrumentation warning fires
// first and mkdirSync will throw because the system user has no home —
// a clear, immediate error is better than silently writing to the wrong path.
function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  const dir = path.join(xdgData, "gleaned");
  fs.mkdirSync(dir, { recursive: true }); // throws with a path in the message if unwritable
  return path.join(dir, "gleaned.db");
}

// Lazy — not called at module load time so next build does not open the
// database while collecting route metadata across parallel workers.
export function getDb(): DrizzleDb {
  if (!g._sqlite) {
    g._sqlite = new Database(resolveDbPath());
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
