import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

async function withDevices(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash) values
      ('${ANAND}', 'hash-anand'), ('${AMMA}', 'hash-amma');
    insert into devices (user_id, expo_push_token, platform) values
      ('${ANAND}', 'ExponentPushToken[anand]', 'android'),
      ('${AMMA}', 'ExponentPushToken[amma]', 'android');
  `);
  return db;
}

describe("devices RLS", () => {
  it("shows a user only their own devices", async () => {
    const db = await withDevices();
    await expect(
      db.asUser(ANAND, "select expo_push_token from devices")
    ).resolves.toEqual([{ expo_push_token: "ExponentPushToken[anand]" }]);
    await db.close();
  });

  it("does not leak another user's push token", async () => {
    // A push token is a capability, not just an identifier: anyone holding it
    // and any Expo account can send to that handset.
    const db = await withDevices();
    await expect(
      db.asUser(ANAND, `select expo_push_token from devices where user_id = '${AMMA}'`)
    ).resolves.toEqual([]);
    await db.close();
  });

  it("lets a user register their own device", async () => {
    const db = await withDevices();
    await db.asUser(
      ANAND,
      `insert into devices (user_id, expo_push_token, platform)
       values ('${ANAND}', 'ExponentPushToken[anand-tablet]', 'android')`
    );
    await expect(
      db.asUser(ANAND, "select count(*)::int as n from devices")
    ).resolves.toEqual([{ n: 2 }]);
    await db.close();
  });

  it("refuses a device registered against someone else's account", async () => {
    // Otherwise a caller could point their own push token at Amma's account,
    // or worse, register a token they control so her reminders arrive on
    // their handset.
    const db = await withDevices();
    await expect(
      db.asUser(
        ANAND,
        `insert into devices (user_id, expo_push_token, platform)
         values ('${AMMA}', 'ExponentPushToken[attacker]', 'android')`
      )
    ).rejects.toThrow(/row-level security/i);
    await db.close();
  });

  it("refuses moving an existing device to another account", async () => {
    // USING alone would allow this: the row starts out owned by the caller,
    // so only a WITH CHECK on the new row stops the hand-off.
    const db = await withDevices();
    await expect(
      db.asUser(ANAND, `update devices set user_id = '${AMMA}' where user_id = '${ANAND}'`)
    ).rejects.toThrow(/row-level security/i);
    await db.close();
  });

  it("cannot delete another user's device", async () => {
    // Deleting Amma's device would silence every reminder she is due.
    const db = await withDevices();
    await db.asUser(ANAND, `delete from devices where user_id = '${AMMA}'`);
    await expect(db.asService("select count(*)::int as n from devices")).resolves.toEqual([
      { n: 2 },
    ]);
    await db.close();
  });

  it("drops a user's devices when the account is deleted", async () => {
    const db = await withDevices();
    await db.asUser(ANAND, `delete from users where id = '${ANAND}'`);
    await expect(db.asService("select count(*)::int as n from devices")).resolves.toEqual([
      { n: 1 },
    ]);
    await db.close();
  });
});
