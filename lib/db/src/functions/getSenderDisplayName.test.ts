import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

const seed = `
  insert into users (id, phone_hash, display_name) values
    ('${AMMA}', 'hash-amma', 'Amma');
`;

async function withSeed(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(seed);
  return db;
}

describe("get_sender_display_name", () => {
  it("returns the display name for an existing user", async () => {
    const db = await withSeed();
    const result = await db.asUser(ANAND, `select get_sender_display_name('${AMMA}') as display_name`);
    expect(result).toEqual([{ display_name: "Amma" }]);
    await db.close();
  });

  it("returns null, not an error, for a nonexistent id", async () => {
    const db = await withSeed();
    const fakeId = "99999999-9999-9999-9999-999999999999";
    const result = await db.asUser(ANAND, `select get_sender_display_name('${fakeId}') as display_name`);
    expect(result).toEqual([{ display_name: null }]);
    await db.close();
  });

  it("refuses an unauthenticated caller", async () => {
    const db = await withSeed();
    await expect(db.asAnon(`select get_sender_display_name('${AMMA}')`)).rejects.toThrow();
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    // Without this, the in-body auth check is unreachable and therefore
    // untested - sabotaging it away breaks nothing, which is how a guard rots
    // into a comment (matches hash_lookup()'s equivalent test).
    const db = await withSeed();
    await db.asService("grant execute on function get_sender_display_name(uuid) to anon;");
    await expect(db.asAnon(`select get_sender_display_name('${AMMA}')`)).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });
});
