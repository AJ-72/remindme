import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { ANAND, AMMA } from "../testing/identities";

async function withUsers() {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash, display_name) values
      ('${ANAND}', 'hash-anand', 'Anand'),
      ('${AMMA}', 'hash-amma', 'Amma');
  `);
  return db;
}

describe("users RLS", () => {
  it("shows a user their own row", async () => {
    const db = await withUsers();
    await expect(
      db.asUser(ANAND, "select display_name from users")
    ).resolves.toEqual([{ display_name: "Anand" }]);
    await db.close();
  });

  it("does not let one user read another's row", async () => {
    // Discovery by phone number is NOT this path. It goes through a peppered
    // SECURITY DEFINER lookup, so that a caller learns only "yes/no for this
    // one number" and never gets a readable table of everyone.
    const db = await withUsers();
    await expect(
      db.asUser(ANAND, `select display_name from users where id = '${AMMA}'`)
    ).resolves.toEqual([]);
    await db.close();
  });

  it("does not let a client create an account at all", async () => {
    // Account creation follows number verification, so it is a server
    // operation. Both layers refuse it: no INSERT privilege and no INSERT
    // policy. This is the door the first draft left open - registering with
    // someone else's number and then self-claiming every invitation to it.
    const db = await createSchemaTestDb();
    await expect(
      db.asUser(ANAND, `insert into users (id, phone_hash) values ('${ANAND}', 'hash-anand')`)
    ).rejects.toThrow(/permission denied/i);
    await db.close();
  });

  it("does not let a user delete someone else's account", async () => {
    const db = await withUsers();
    await db.asUser(ANAND, `delete from users where id = '${AMMA}'`);
    await expect(
      db.asService(`select count(*)::int as n from users`)
    ).resolves.toEqual([{ n: 2 }]);
    await db.close();
  });

  it("refuses a client attempt to rebind a phone number", async () => {
    // The exact shape of the identity defect that broke the first draft:
    // whoever writes phone_hash owns that number. Binding is a verified
    // server operation, so the client is not granted the column at all -
    // RLS is row-level and cannot express this on its own.
    //
    // The target is a number NOBODY holds. Aiming at an existing user's hash
    // would be refused by the unique index whether the privilege held or not,
    // so the test would pass with the protection removed - and squatting an
    // unregistered number is the actual attack anyway.
    const db = await withUsers();
    await expect(
      db.asUser(
        ANAND,
        `update users set phone_hash = 'hash-unregistered' where id = '${ANAND}'`
      )
    ).rejects.toThrow(/permission denied/i);
    await db.close();
  });

  it("still lets a user edit their own profile", async () => {
    const db = await withUsers();
    await db.asUser(ANAND, `update users set display_name = 'AJ', discoverable = false where id = '${ANAND}'`);
    await expect(
      db.asUser(ANAND, "select display_name, discoverable from users")
    ).resolves.toEqual([{ display_name: "AJ", discoverable: false }]);
    await db.close();
  });
});
