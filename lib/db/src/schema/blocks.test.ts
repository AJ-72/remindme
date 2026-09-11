import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

/** Amma has blocked Anand. */
async function withBlock(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash) values
      ('${ANAND}', 'hash-anand'),
      ('${AMMA}', 'hash-amma'),
      ('${STRANGER}', 'hash-stranger');
    insert into blocks (blocker_id, blocked_id) values ('${AMMA}', '${ANAND}');
  `);
  return db;
}

describe("blocks RLS", () => {
  it("shows the blocker their own list", async () => {
    const db = await withBlock();
    await expect(db.asUser(AMMA, "select blocked_id from blocks")).resolves.toEqual([
      { blocked_id: ANAND },
    ]);
    await db.close();
  });

  it("hides the block list from the person blocked", async () => {
    // A block list is a record of who someone does not want to hear from -
    // the most sensitive object in this database. The sender IS told his
    // reminder was blocked, but that message comes from the send path; it is
    // not read access to her list, which would also disclose everyone else
    // on it.
    const db = await withBlock();
    await expect(db.asUser(ANAND, "select * from blocks")).resolves.toEqual([]);
    await db.close();
  });

  it("refuses a block written on someone else's behalf", async () => {
    // Otherwise anyone could cut two other people off from each other.
    const db = await withBlock();
    await expect(
      db.asUser(
        ANAND,
        `insert into blocks (blocker_id, blocked_id) values ('${AMMA}', '${STRANGER}')`
      )
    ).rejects.toThrow(/row-level security/i);
    await db.close();
  });

  it("does not let the blocked party unblock themselves", async () => {
    // Unblock is a DELETE - that is the whole reason blocks are rows rather
    // than a flag - so this is the shape the attack takes.
    const db = await withBlock();
    await db.asUser(ANAND, `delete from blocks where blocked_id = '${ANAND}'`);
    await expect(db.asService("select count(*)::int as n from blocks")).resolves.toEqual([
      { n: 1 },
    ]);
    await db.close();
  });

  it("lets the blocker unblock", async () => {
    const db = await withBlock();
    await db.asUser(AMMA, `delete from blocks where blocked_id = '${ANAND}'`);
    await expect(db.asService("select count(*)::int as n from blocks")).resolves.toEqual([
      { n: 0 },
    ]);
    await db.close();
  });
});
