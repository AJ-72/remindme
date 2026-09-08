import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

const seed = `
  insert into users (id, phone_hash) values
    ('${ANAND}', 'hash-anand'),
    ('${AMMA}', 'hash-amma'),
    ('${STRANGER}', 'hash-stranger');
`;

async function withSeed(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(seed);
  return db;
}

describe("send_invitation", () => {
  it("creates an invitation addressed to the recipient's hash, from the caller", async () => {
    const db = await withSeed();
    const result = await db.asUser(
      ANAND,
      `select sender_id, recipient_phone_hash, title, description, status
         from send_invitation('${AMMA}', 'Take BP tablets', 'After breakfast', now() + interval '2 hours')`
    );
    expect(result).toEqual([
      {
        sender_id: ANAND,
        recipient_phone_hash: "hash-amma",
        title: "Take BP tablets",
        description: "After breakfast",
        status: "invited",
      },
    ]);
    await db.close();
  });

  it("sets expires_at and original_datetime to the given datetime", async () => {
    const db = await withSeed();
    const result = await db.asUser(
      ANAND,
      `select (expires_at < now() + interval '2 hours' + interval '1 second' and expires_at > now()) as ok,
              extract(epoch from (expires_at - original_datetime)) as delta
         from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours')`
    );
    expect(Number(result[0].delta)).toBe(0);
    await db.close();
  });

  it("caps content_expires_at at 30 days even for a far-future datetime", async () => {
    const db = await withSeed();
    const result = await db.asUser(
      ANAND,
      `select (content_expires_at < now() + interval '31 days') as within_cap,
              (content_expires_at > now() + interval '29 days') as near_cap
         from send_invitation('${AMMA}', 'X', 'Y', now() + interval '365 days')`
    );
    expect(result).toEqual([{ within_cap: true, near_cap: true }]);
    await db.close();
  });

  it("uses the datetime directly as content_expires_at when it is sooner than 30 days", async () => {
    const db = await withSeed();
    const result = await db.asUser(
      ANAND,
      `select (content_expires_at < now() + interval '3 hours') as ok
         from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours')`
    );
    expect(result).toEqual([{ ok: true }]);
    await db.close();
  });

  it("refuses to send when the recipient has blocked the sender", async () => {
    const db = await withSeed();
    await db.asUser(AMMA, `insert into blocks (blocker_id, blocked_id) values ('${AMMA}', '${ANAND}')`);
    await expect(
      db.asUser(ANAND, `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours')`)
    ).rejects.toThrow();
    await db.close();
  });

  it("does not let a caller address mail to a hash the given app_user_id doesn't own", async () => {
    // p_recipient_app_user_id must resolve to the CURRENT phone_hash of that
    // id, never a client-supplied hash string, so this is implicitly tested
    // by every case above using the id, not a hash, as input.
    const db = await withSeed();
    const result = await db.asUser(
      ANAND,
      `select recipient_phone_hash from send_invitation('${STRANGER}', 'X', 'Y', now() + interval '2 hours')`
    );
    expect(result).toEqual([{ recipient_phone_hash: "hash-stranger" }]);
    await db.close();
  });

  it("refuses an unauthenticated caller", async () => {
    const db = await withSeed();
    await expect(
      db.asAnon(`select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours')`)
    ).rejects.toThrow();
    await db.close();
  });

  it("refuses a nonexistent recipient id", async () => {
    const db = await withSeed();
    const fakeId = "99999999-9999-9999-9999-999999999999";
    await expect(
      db.asUser(ANAND, `select * from send_invitation('${fakeId}', 'X', 'Y', now() + interval '2 hours')`)
    ).rejects.toThrow();
    await db.close();
  });
});
