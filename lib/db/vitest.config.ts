import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // verifyRls.gate.test.ts is the deploy gate, run only via `verify:rls`
    // (which uses vitest.rls-gate.config.ts instead of this file) — it
    // hard-fails when DATABASE_URL is unset, by design, so it must never
    // run as part of the ordinary PGlite-only `test` command or every
    // contributor without Supabase access gets a broken default test run.
    exclude: ["**/node_modules/**", "src/verifyRls.gate.test.ts"],
    // Builds the prepared schema once per run; workers load it from disk.
    globalSetup: ["src/testing/globalSetup.ts"],
    // PGlite boots a real Postgres in WASM; the default 5s is tight on a cold run.
    testTimeout: 30_000,
  },
});
