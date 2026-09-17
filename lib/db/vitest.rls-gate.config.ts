import { defineConfig } from "vitest/config";

// Separate config for the RLS deploy gate (`verify:rls`/`deploy`), which
// must run ONLY when explicitly invoked — never picked up by plain `test`'s
// PGlite-only suite, since the gate hard-fails when DATABASE_URL is unset
// and most contributors won't have Supabase access for local `test` runs.
// A single shared config with an include/exclude pair does not achieve
// this: vitest's `exclude` applies even to an explicit file path passed on
// the CLI, so excluding this file from the main config would also block
// `vitest run src/verifyRls.gate.test.ts` from running it directly.
export default defineConfig({
  test: {
    include: ["src/verifyRls.gate.test.ts"],
    testTimeout: 30_000,
  },
});
