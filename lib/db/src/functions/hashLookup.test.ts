import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

const seed = `
  insert into users (id, phone_hash, discoverable) values
    ('${AMMA}', 'hash-amma', true),
    ('${ANAND}', 'hash-anand-not-discoverable', false);
`;

async function withSeed(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(seed);
  return db;
}

describe("hash_lookup", () => {
  it("returns exists=true and the opaque user id for a registered, discoverable hash", async () => {
    const db = await withSeed();
    const result = await db.asUser(ANAND, `select * from hash_lookup('hash-amma')`);
    expect(result).toEqual([{ app_user_id: AMMA, exists: true }]);
    await db.close();
  });

  it("returns exists=false for an unregistered hash", async () => {
    const db = await withSeed();
    const result = await db.asUser(ANAND, `select * from hash_lookup('hash-nobody')`);
    expect(result).toEqual([{ app_user_id: null, exists: false }]);
    await db.close();
  });

  it("returns exists=false for a registered but NOT discoverable hash", async () => {
    // discoverable=false must behave identically to "no such user" from the
    // caller's point of view - that is the whole point of the setting.
    const db = await withSeed();
    const result = await db.asUser(AMMA, `select * from hash_lookup('hash-anand-not-discoverable')`);
    expect(result).toEqual([{ app_user_id: null, exists: false }]);
    await db.close();
  });

  it("refuses an unauthenticated caller", async () => {
    const db = await withSeed();
    await expect(db.asAnon(`select * from hash_lookup('hash-amma')`)).rejects.toThrow();
    await db.close();
  });

  it("returns exists=false, not an error, when a caller looks up their own hash", async () => {
    const db = await withSeed();
    const result = await db.asUser(AMMA, `select * from hash_lookup('hash-amma')`);
    expect(result).toEqual([{ app_user_id: null, exists: false }]);
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    // Without this, the in-body auth check is unreachable and therefore
    // untested - sabotaging it away breaks nothing, which is how a guard rots
    // into a comment (see claim_invitations()'s equivalent test).
    const db = await withSeed();
    await db.asService("grant execute on function hash_lookup(text) to anon;");
    await expect(db.asAnon(`select * from hash_lookup('hash-amma')`)).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });
});
