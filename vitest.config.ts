import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" throws outside Next's server bundle; it's a no-op in tests.
      "server-only": path.resolve(__dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Placeholder values so src/lib/env.ts validates. No test talks to a real service.
    env: {
      DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
      AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      WA_APP_SECRET: "test-app-secret",
      WA_VERIFY_TOKEN: "test-verify-token",
      WA_SYSTEM_USER_TOKEN: "test-system-token",
    },
    globalSetup: ["tests/support/global-setup.ts"],
    // DB tests share one database, so run files one at a time.
    fileParallelism: false,
  },
});
