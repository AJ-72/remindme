import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";

/**
 * Self-serve first-time registration (OTP deferred). Same risk class as
 * bind_via_invite_token(): SECURITY DEFINER, writes a not-yet-existing users
 * row, so sabotage-tested the same way (auth check reachability, search_path
 * hijack, the phone_hash collision guard).
 */

const seed = `
  insert into users (id, phone_hash, display_name) values
    ('${ANAND}', 'hash-anand', 'Anand');
`;

describe("self_register", () => {
  it("creates a fresh account bound to the caller's asserted phone_hash", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    const [row] = await db.asUser(AMMA, `select * from self_register('hash-amma')`);
    expect(row.id).toBe(AMMA);
    expect(row.phone_hash).toBe("hash-amma");
    await db.close();
  });

  it("is idempotent across repeated calls from the same account", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asUser(AMMA, `select * from self_register('hash-amma')`);
    const [row] = await db.asUser(AMMA, `select * from self_register('hash-amma')`);
    expect(row.phone_hash).toBe("hash-amma");
    await expect(db.asService("select count(*)::int as n from users")).resolves.toEqual([
      { n: 2 }, // Anand (seeded) + Amma once, not twice.
    ]);
    await db.close();
  });

  it("lets the same account re-register a DIFFERENT number (correcting a typo)", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asUser(AMMA, `select * from self_register('hash-typo')`);
    const [row] = await db.asUser(AMMA, `select * from self_register('hash-amma')`);
    expect(row.phone_hash).toBe("hash-amma");
    await db.close();
  });

  it("refuses a number already registered to a different account", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asService(`insert into users (id, phone_hash) values ('${STRANGER}', 'hash-amma')`);
    await expect(
      db.asUser(AMMA, `select * from self_register('hash-amma')`)
    ).rejects.toThrow(/already registered/i);
    await db.close();
  });

  it("refuses an anonymous caller", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await expect(db.asAnon(`select * from self_register('hash-amma')`)).rejects.toThrow(
      /permission denied/i
    );
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asService("grant execute on function self_register(text) to anon;");
    await expect(db.asAnon(`select * from self_register('hash-amma')`)).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });

  it("refuses a null or empty phone_hash", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await expect(db.asUser(AMMA, `select * from self_register('')`)).rejects.toThrow(
      /phone_hash required/i
    );
    await db.close();
  });

  it("is not hijackable through the caller's search_path", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asService(`
      create schema evil3;
      create table evil3.users (like public.users including all);
      grant usage on schema evil3 to authenticated;
      grant select, insert on evil3.users to authenticated;
    `);

    const [row] = await db.asUser(AMMA, `select * from public.self_register('hash-amma')`, {
      searchPath: "evil3, public",
    });
    expect(row.phone_hash).toBe("hash-amma");

    // The write landed on the REAL table, not the planted one.
    await expect(
      db.asService(`select phone_hash from public.users where id = '${AMMA}'`)
    ).resolves.toEqual([{ phone_hash: "hash-amma" }]);
    await expect(db.asService(`select count(*)::int as n from evil3.users`)).resolves.toEqual([
      { n: 0 },
    ]);
    await db.close();
  });

  it("returns exactly the caller's own row, even with other users present", async () => {
    const db = await createSchemaTestDb();
    await db.asService(seed);
    await db.asService(`insert into users (id, phone_hash) values ('${STRANGER}', 'hash-stranger')`);
    const rows = await db.asUser(AMMA, `select * from self_register('hash-amma')`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(AMMA);
    await db.close();
  });
});
