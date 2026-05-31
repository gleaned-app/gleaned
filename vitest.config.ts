import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname) },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "app/api/**/*.test.ts", "app/api/_test-db.ts"],
    },
  },
});
