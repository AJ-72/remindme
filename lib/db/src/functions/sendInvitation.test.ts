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

  it("refuses the 11th distinct new recipient within 24 hours (T4.6)", async () => {
    const db = await withSeed();
    for (let i = 0; i < 10; i++) {
      const id = `20000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
      await db.asService(`insert into users (id, phone_hash) values ('${id}', 'hash-fc-${i}');`);
      await db.asUser(ANAND, `select * from send_invitation('${id}', 'X', 'Y', now() + interval '2 hours')`);
    }
    await expect(
      db.asUser(ANAND, `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours')`)
    ).rejects.toThrow();
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

  describe("recurrence (M2 Task 5c)", () => {
    it("defaults to null when no recurrence is given, matching the client's own convention", async () => {
      const db = await withSeed();
      const result = await db.asUser(
        ANAND,
        `select recurrence from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours')`
      );
      expect(result).toEqual([{ recurrence: null }]);
      await db.close();
    });

    it("writes the recurrence rule straight through when given", async () => {
      const db = await withSeed();
      const result = await db.asUser(
        ANAND,
        `select recurrence from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours', '{"freq":"daily","interval":1}'::jsonb)`
      );
      expect(result).toEqual([{ recurrence: { freq: "daily", interval: 1 } }]);
      await db.close();
    });

    it("does not clamp the reminder time for a recurring send far in the future - datetime is unclamped, only content_expires_at is", async () => {
      const db = await withSeed();
      const result = await db.asUser(
        ANAND,
        `select (datetime > now() + interval '364 days') as datetime_unclamped,
                (content_expires_at < now() + interval '31 days') as content_capped
           from send_invitation('${AMMA}', 'X', 'Y', now() + interval '365 days', '{"freq":"yearly","interval":1}'::jsonb)`
      );
      expect(result).toEqual([{ datetime_unclamped: true, content_capped: true }]);
      await db.close();
    });

    it("rejects an interval below 1", async () => {
      const db = await withSeed();
      await expect(
        db.asUser(
          ANAND,
          `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours', '{"freq":"daily","interval":0}'::jsonb)`
        )
      ).rejects.toThrow();
      await db.close();
    });

    it("rejects a negative interval", async () => {
      const db = await withSeed();
      await expect(
        db.asUser(
          ANAND,
          `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours', '{"freq":"daily","interval":-1}'::jsonb)`
        )
      ).rejects.toThrow();
      await db.close();
    });

    it("rejects an unknown freq", async () => {
      const db = await withSeed();
      await expect(
        db.asUser(
          ANAND,
          `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours', '{"freq":"hourly","interval":1}'::jsonb)`
        )
      ).rejects.toThrow();
      await db.close();
    });

    it("rejects a malformed shape with no freq at all", async () => {
      const db = await withSeed();
      await expect(
        db.asUser(
          ANAND,
          `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours', '{"interval":1}'::jsonb)`
        )
      ).rejects.toThrow();
      await db.close();
    });

    // A missing "freq" is `null = any(...)`, which SQL's three-valued logic
    // evaluates to NULL rather than FALSE - a naive `not (x = any(...))`
    // check would silently let this pass instead of rejecting it. Same bug
    // class for a missing "interval" below.
    it("rejects a shape with no interval at all", async () => {
      const db = await withSeed();
      await expect(
        db.asUser(
          ANAND,
          `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours', '{"freq":"daily"}'::jsonb)`
        )
      ).rejects.toThrow();
      await db.close();
    });

    it("rejects a non-object recurrence value", async () => {
      const db = await withSeed();
      await expect(
        db.asUser(
          ANAND,
          `select * from send_invitation('${AMMA}', 'X', 'Y', now() + interval '2 hours', '"daily"'::jsonb)`
        )
      ).rejects.toThrow();
      await db.close();
    });
  });
});
