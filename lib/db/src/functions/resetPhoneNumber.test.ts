import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, NEW_DEVICE, STRANGER } from "../testing/identities";

/**
 * Collision-recovery "start fresh" branch - see resetPhoneNumber.sql's own
 * header for why this exists ahead of OTP. Same risk class as
 * self_register(): SECURITY DEFINER, writes/deletes rows the caller has no
 * RLS standing over, so sabotage-tested the same way.
 */

const seed = `
  insert into users (id, phone_hash, display_name) values
    ('${ANAND}', 'hash-old-phone', 'Old Anand');
  insert into invitations
    (sender_id, recipient_phone_hash, recipient_id, title, status, datetime,
     original_datetime, expires_at, content_expires_at)
  values
    ('${ANAND}', 'hash-someone-else', null, 'Take BP tablets', 'invited',
     now() + interval '1 hour', now() + interval '1 hour',
     now() + interval '1 hour', now() + interval '1 hour');
  insert into devices (user_id, expo_push_token, platform)
  values ('${ANAND}', 'ExponentPushToken[old-device]', 'android');
`;

describe("reset_phone_number", () => {
  it("deletes the old account and its cascaded rows, then claims the number fresh", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);

    const [row] = await db.asUser(NEW_DEVICE, `select * from reset_phone_number('hash-old-phone')`);
    expect(row.id).toBe(NEW_DEVICE);
    expect(row.phone_hash).toBe("hash-old-phone");

    await expect(
      db.asService(`select count(*)::int as n from users where id = '${ANAND}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await expect(
      db.asService(`select count(*)::int as n from invitations where sender_id = '${ANAND}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await expect(
      db.asService(`select count(*)::int as n from devices where user_id = '${ANAND}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await db.close();
  });

  it("is a no-op (not an error) when the caller already owns this exact number", async () => {
    const db = await createSchemaTestDb();
    await db.asService(`insert into users (id, phone_hash) values ('${AMMA}', 'hash-amma')`);
    const [row] = await db.asUser(AMMA, `select * from reset_phone_number('hash-amma')`);
    expect(row.phone_hash).toBe("hash-amma");
    await db.close();
  });

  it("succeeds even if no account currently holds the number (nothing to delete)", async () => {
    const db = await createSchemaTestDb();
    const [row] = await db.asUser(NEW_DEVICE, `select * from reset_phone_number('hash-never-used')`);
    expect(row.id).toBe(NEW_DEVICE);
    await db.close();
  });

  it("refuses an anonymous caller", async () => {
    const db = await createSchemaTestDb();
    await expect(db.asAnon(`select * from reset_phone_number('hash-old-phone')`)).rejects.toThrow(
      /permission denied/i
    );
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    const db = await createSchemaTestDb();
    await db.asService("grant execute on function reset_phone_number(text) to anon;");
    await expect(db.asAnon(`select * from reset_phone_number('hash-old-phone')`)).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });

  it("refuses a null or empty phone_hash", async () => {
    const db = await createSchemaTestDb();
    await expect(db.asUser(NEW_DEVICE, `select * from reset_phone_number('')`)).rejects.toThrow(
      /phone_hash required/i
    );
    await db.close();
  });

  it("does not touch an unrelated account's number", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asService(`insert into users (id, phone_hash) values ('${STRANGER}', 'hash-stranger')`);
    await db.asUser(NEW_DEVICE, `select * from reset_phone_number('hash-old-phone')`);
    await expect(
      db.asService(`select phone_hash from users where id = '${STRANGER}'`)
    ).resolves.toEqual([{ phone_hash: "hash-stranger" }]);
    await db.close();
  });

  it("is not hijackable through the caller's search_path", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asService(`
      create schema evil_reset;
      create table evil_reset.users (like public.users including all);
      grant usage on schema evil_reset to authenticated;
      grant select, insert, delete on evil_reset.users to authenticated;
    `);

    const [row] = await db.asUser(
      NEW_DEVICE,
      `select * from public.reset_phone_number('hash-old-phone')`,
      { searchPath: "evil_reset, public" }
    );
    expect(row.phone_hash).toBe("hash-old-phone");

    await expect(
      db.asService(`select count(*)::int as n from public.users where id = '${ANAND}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await db.close();
  });
});
