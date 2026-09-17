import { describe, expect, it } from "vitest";
import { verifyRls } from "./verifyRls";

/**
 * Verifies RLS on a REAL deployed database (not PGlite) — SKIPPED by
 * default, picked up by the normal `test` run's glob but requiring
 * DATABASE_URL to actually execute, so `pnpm --filter @workspace/db run
 * test` (PGlite-only, no external dependency) stays green with nothing
 * configured.
 *
 * THIS FILE IS NOT WHAT `verify:rls` RUNS. A skip-by-default test is exactly
 * the wrong thing to put behind a deploy gate — `deploy` chaining into a
 * suite that silently reports 0 failures / exit 0 when DATABASE_URL happens
 * to be unset (wrong env var name, unexported in that shell, etc.) would
 * reproduce the original bug this module exists to catch, one layer up:
 * a step reports success having verified nothing. `verify:rls` runs
 * `verifyRls.gate.ts` instead, which throws if DATABASE_URL is missing
 * rather than skipping. This file exists only so a plain `test` run also
 * exercises this logic whenever a developer happens to have DATABASE_URL
 * set locally, without forcing everyone to have Supabase access to run the
 * PGlite suite.
 *
 * This is deliberately separate from the PGlite RLS suite: PGlite tests
 * prove the *schema* is correct. This proves what actually got DEPLOYED
 * matches the schema — a gap PGlite cannot see by construction, since it
 * never goes through `drizzle-kit push`'s diff-against-existing-remote-state
 * path at all. See system_learnings.md's 2026-09-08 entry for why this
 * distinction turned out to matter: every policy on the live project had a
 * NULL qualifier (USING (true), enforcing nothing) while the PGlite suite
 * and `rls_enabled`/`get_advisors` all stayed green.
 */
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("verifyRls (live database, opportunistic)", () => {
  it("every deployed policy matches what the schema source declares", async () => {
    const failures = await verifyRls(databaseUrl as string);
    expect(failures).toEqual([]);
  });
});
