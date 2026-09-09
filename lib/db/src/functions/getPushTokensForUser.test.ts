import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

const seed = `
  insert into users (id, phone_hash, discoverable) values
    ('${AMMA}', 'hash-amma', true),
    ('${ANAND}', 'hash-anand', true),
    ('${STRANGER}', 'hash-stranger', true);

  insert into devices (user_id, expo_push_token, platform) values
    ('${AMMA}', 'ExponentPushToken[amma-1]', 'android'),
    ('${AMMA}', 'ExponentPushToken[amma-2]', 'ios');

  -- ANAND has sent AMMA an invitation - the trust relationship the guard
  -- checks for.
  insert into invitations (sender_id, recipient_phone_hash, datetime, original_datetime, expires_at, content_expires_at) values
    ('${ANAND}', 'hash-amma', now() + interval '1 day', now() + interval '1 day', now() + interval '1 day', now() + interval '1 day');
`;

async function withSeed(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(seed);
  return db;
}

describe("get_push_tokens_for_user", () => {
  it("returns tokens for the given user when the caller has an invitation to them", async () => {
    const db = await withSeed();
    const result = await db.asUser(ANAND, `select * from get_push_tokens_for_user('${AMMA}')`);
    expect(result).toEqual(
      expect.arrayContaining([
        { expo_push_token: "ExponentPushToken[amma-1]" },
        { expo_push_token: "ExponentPushToken[amma-2]" },
      ])
    );
    expect(result).toHaveLength(2);
    await db.close();
  });

  it("returns empty for a user with no devices, even with a valid invitation relationship", async () => {
    const db = await withSeed();
    // AMMA has not sent ANAND any invitation, but ANAND has no devices
    // seeded either way - seed a reverse invitation so this exercises "no
    // devices" rather than "no relationship".
    await db.asService(
      `insert into invitations (sender_id, recipient_phone_hash, datetime, original_datetime, expires_at, content_expires_at) values ('${AMMA}', 'hash-anand', now() + interval '1 day', now() + interval '1 day', now() + interval '1 day', now() + interval '1 day');`
    );
    const result = await db.asUser(AMMA, `select * from get_push_tokens_for_user('${ANAND}')`);
    expect(result).toEqual([]);
    await db.close();
  });

  it("returns ONLY expo_push_token, no other columns", async () => {
    const db = await withSeed();
    const result = await db.asUser(ANAND, `select * from get_push_tokens_for_user('${AMMA}')`);
    expect(result.length).toBeGreaterThan(0);
    for (const row of result as Record<string, unknown>[]) {
      expect(Object.keys(row)).toEqual(["expo_push_token"]);
    }
    await db.close();
  });

  it("refuses an unauthenticated caller", async () => {
    const db = await withSeed();
    await expect(db.asAnon(`select * from get_push_tokens_for_user('${AMMA}')`)).rejects.toThrow();
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    // Without this, the in-body auth check is unreachable and therefore
    // untested - sabotaging it away breaks nothing, which is how a guard rots
    // into a comment (see hash_lookup()'s equivalent test).
    const db = await withSeed();
    await db.asService("grant execute on function get_push_tokens_for_user(uuid) to anon;");
    await expect(db.asAnon(`select * from get_push_tokens_for_user('${AMMA}')`)).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });

  it("refuses a caller with NO prior invitation to the target", async () => {
    const db = await withSeed();
    // STRANGER has never sent AMMA anything.
    await expect(
      db.asUser(STRANGER, `select * from get_push_tokens_for_user('${AMMA}')`)
    ).rejects.toThrow(/no invitation relationship/i);
    await db.close();
  });

  it("sabotage check: still refuses without a prior invitation if EXECUTE is granted to anon", async () => {
    const db = await withSeed();
    await db.asService("grant execute on function get_push_tokens_for_user(uuid) to anon;");
    await expect(
      db.asAnon(`select * from get_push_tokens_for_user('${AMMA}')`)
    ).rejects.toThrow(/not authenticated/i);
    await db.close();
  });
});
