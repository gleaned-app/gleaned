import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./lib/db/schema/shared/entries.ts",
    "./lib/db/schema/shared/threads.ts",
    "./lib/db/schema/server/settings.ts",
    "./lib/db/schema/server/sessions.ts",
  ],
  out: "./lib/db/migrations",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./gleaned.db",
  },
});
