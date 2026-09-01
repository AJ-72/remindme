import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Builds the prepared schema once per run; workers load it from disk.
    globalSetup: ["src/testing/globalSetup.ts"],
    // PGlite boots a real Postgres in WASM; the default 5s is tight on a cold run.
    testTimeout: 30_000,
  },
});
