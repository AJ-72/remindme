import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

async function withLinkCode(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash) values
      ('${ANAND}', 'hash-anand'), ('${AMMA}', 'hash-amma');
    insert into link_codes (code, user_id, expires_at)
    values ('AMMA-42', '${AMMA}', now() + interval '1 day');
  `);
  return db;
}

describe("link_codes RLS", () => {
  it("shows a user the code they are handing out", async () => {
    const db = await withLinkCode();
    await expect(db.asUser(AMMA, "select code from link_codes")).resolves.toEqual([
      { code: "AMMA-42" },
    ]);
    await db.close();
  });

  it("does not let another user read someone's code", async () => {
    // A link code is a bearer credential for the dual-SIM repair path:
    // holding it links you to that account. Readable codes would be
    // enumerable ones.
    const db = await withLinkCode();
    await expect(db.asUser(ANAND, "select code from link_codes")).resolves.toEqual([]);
    await db.close();
  });

  it("refuses a client-minted code", async () => {
    // Codes must be unguessable and single-use, which is a property of how
    // they are generated and consumed. Minting is a server operation.
    const db = await withLinkCode();
    await expect(
      db.asUser(
        ANAND,
        `insert into link_codes (code, user_id, expires_at)
         values ('GUESSED', '${ANAND}', now() + interval '1 day')`
      )
    ).rejects.toThrow(/permission denied/i);
    await db.close();
  });

  it("lets a user revoke their own code", async () => {
    const db = await withLinkCode();
    await db.asUser(AMMA, "delete from link_codes");
    await expect(db.asService("select count(*)::int as n from link_codes")).resolves.toEqual([
      { n: 0 },
    ]);
    await db.close();
  });

  it("does not let another user revoke it", async () => {
    const db = await withLinkCode();
    await db.asUser(ANAND, "delete from link_codes");
    await expect(db.asService("select count(*)::int as n from link_codes")).resolves.toEqual([
      { n: 1 },
    ]);
    await db.close();
  });
});
