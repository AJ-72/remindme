import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, NEW_DEVICE, STRANGER } from "../testing/identities";

/**
 * Collision-recovery "this is still me" branch - see migratePhoneNumber.sql's
 * own header for the full rationale, especially why the old row's data is
 * re-pointed rather than the row itself being reused (users.id IS
 * auth.uid()).
 */

const seed = `
  insert into users (id, phone_hash, display_name) values
    ('${ANAND}', 'hash-old-phone', 'Old Anand'),
    ('${STRANGER}', 'hash-stranger', 'Stranger');
  insert into invitations
    (sender_id, recipient_phone_hash, recipient_id, title, status, datetime,
     original_datetime, expires_at, content_expires_at)
  values
    ('${ANAND}', 'hash-stranger', '${STRANGER}', 'Take BP tablets', 'accepted',
     now() + interval '1 hour', now() + interval '1 hour',
     now() + interval '1 hour', now() + interval '1 hour'),
    ('${STRANGER}', 'hash-old-phone', '${ANAND}', 'Call the doctor', 'invited',
     now() + interval '1 hour', now() + interval '1 hour',
     now() + interval '1 hour', now() + interval '1 hour');
  insert into blocks (blocker_id, blocked_id) values ('${ANAND}', '${STRANGER}');
  insert into devices (user_id, expo_push_token, platform)
  values ('${ANAND}', 'ExponentPushToken[old-device]', 'android');
`;

describe("migrate_phone_number", () => {
  it("re-points invitations (both sender and recipient side) to the caller", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);

    const [row] = await db.asUser(NEW_DEVICE, `select * from migrate_phone_number('hash-old-phone')`);
    expect(row.id).toBe(NEW_DEVICE);
    expect(row.phone_hash).toBe("hash-old-phone");

    await expect(
      db.asService(
        `select sender_id from invitations where title = 'Take BP tablets'`
      )
    ).resolves.toEqual([{ sender_id: NEW_DEVICE }]);
    await expect(
      db.asService(
        `select recipient_id from invitations where title = 'Call the doctor'`
      )
    ).resolves.toEqual([{ recipient_id: NEW_DEVICE }]);
    await db.close();
  });

  it("re-points blocks in both directions", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asUser(NEW_DEVICE, `select * from migrate_phone_number('hash-old-phone')`);

    await expect(
      db.asService(
        `select blocker_id, blocked_id from blocks where blocked_id = '${STRANGER}'`
      )
    ).resolves.toEqual([{ blocker_id: NEW_DEVICE, blocked_id: STRANGER }]);
    await db.close();
  });

  it("does not carry devices over - the old device row is gone, not re-pointed", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asUser(NEW_DEVICE, `select * from migrate_phone_number('hash-old-phone')`);

    await expect(
      db.asService(`select count(*)::int as n from devices where user_id = '${NEW_DEVICE}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await expect(
      db.asService(`select count(*)::int as n from devices where user_id = '${ANAND}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await db.close();
  });

  it("deletes the old account row after re-pointing", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asUser(NEW_DEVICE, `select * from migrate_phone_number('hash-old-phone')`);
    await expect(
      db.asService(`select count(*)::int as n from users where id = '${ANAND}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await db.close();
  });

  it("keeps the caller's own existing block rather than erroring on a conflict", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    // The new caller already blocked STRANGER independently, before migrating.
    await db.asService(`insert into users (id, phone_hash) values ('${NEW_DEVICE}', 'hash-temp')`);
    await db.asService(`insert into blocks (blocker_id, blocked_id) values ('${NEW_DEVICE}', '${STRANGER}')`);

    await db.asUser(NEW_DEVICE, `select * from migrate_phone_number('hash-old-phone')`);

    await expect(
      db.asService(
        `select count(*)::int as n from blocks where blocker_id = '${NEW_DEVICE}' and blocked_id = '${STRANGER}'`
      )
    ).resolves.toEqual([{ n: 1 }]);
    await db.close();
  });

  it("is a no-op (not an error) when the caller already owns this exact number", async () => {
    const db = await createSchemaTestDb();
    await db.asService(`insert into users (id, phone_hash) values ('${AMMA}', 'hash-amma')`);
    const [row] = await db.asUser(AMMA, `select * from migrate_phone_number('hash-amma')`);
    expect(row.phone_hash).toBe("hash-amma");
    await db.close();
  });

  it("succeeds even if no account currently holds the number", async () => {
    const db = await createSchemaTestDb();
    const [row] = await db.asUser(NEW_DEVICE, `select * from migrate_phone_number('hash-never-used')`);
    expect(row.id).toBe(NEW_DEVICE);
    await db.close();
  });

  it("refuses an anonymous caller", async () => {
    const db = await createSchemaTestDb();
    await expect(db.asAnon(`select * from migrate_phone_number('hash-old-phone')`)).rejects.toThrow(
      /permission denied/i
    );
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    const db = await createSchemaTestDb();
    await db.asService("grant execute on function migrate_phone_number(text) to anon;");
    await expect(db.asAnon(`select * from migrate_phone_number('hash-old-phone')`)).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });

  it("refuses a null or empty phone_hash", async () => {
    const db = await createSchemaTestDb();
    await expect(db.asUser(NEW_DEVICE, `select * from migrate_phone_number('')`)).rejects.toThrow(
      /phone_hash required/i
    );
    await db.close();
  });

  it("is not hijackable through the caller's search_path", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asService(`
      create schema evil_migrate;
      create table evil_migrate.users (like public.users including all);
      grant usage on schema evil_migrate to authenticated;
      grant select, insert, update, delete on evil_migrate.users to authenticated;
    `);

    const [row] = await db.asUser(
      NEW_DEVICE,
      `select * from public.migrate_phone_number('hash-old-phone')`,
      { searchPath: "evil_migrate, public" }
    );
    expect(row.phone_hash).toBe("hash-old-phone");

    await expect(
      db.asService(`select count(*)::int as n from public.users where id = '${ANAND}'`)
    ).resolves.toEqual([{ n: 0 }]);
    await db.close();
  });
});
