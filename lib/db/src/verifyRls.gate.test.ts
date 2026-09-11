import { describe, expect, it } from "vitest";
import { verifyRls } from "./verifyRls";

/**
 * The actual deploy gate — run by `verify:rls`/`deploy`, never by plain
 * `test`. Unlike `verifyRls.test.ts` (which skips silently when
 * DATABASE_URL is unset, so ordinary `test` runs don't need Supabase
 * access), THIS FILE THROWS if DATABASE_URL is missing. A gate that can
 * report "passed" having checked nothing is not a gate — it is exactly the
 * shape of the original bug (a deploy step reporting success while
 * enforcing nothing) recreated one layer up. See verifyRls.ts's header for
 * the full incident this exists to prevent.
 *
 * Deliberately run by an explicit path (`vitest run src/verifyRls.gate.test.ts`,
 * see the `verify:rls` script), never picked up by plain `test`'s
 * src/**\/*.test.ts glob incidentally — see the note in verifyRls.test.ts.
 */
const databaseUrl = process.env.DATABASE_URL;

describe("verifyRls (deploy gate)", () => {
  it("requires DATABASE_URL to be set — a silent skip here defeats the entire point", () => {
    expect(databaseUrl, "DATABASE_URL must be set for verify:rls to check anything").toBeTruthy();
  });

  it("every deployed policy matches what the schema source declares", async () => {
    if (!databaseUrl) {
      // The assertion above already failed and reported the real problem;
      // don't also throw a confusing "Client was called with undefined" here.
      return;
    }
    const failures = await verifyRls(databaseUrl);
    expect(failures).toEqual([]);
  });
});
