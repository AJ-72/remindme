import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

const seed = `
  insert into users (id, phone_hash, discoverable) values
    ('${AMMA}', 'hash-amma', true),
    ('${ANAND}', 'hash-anand', true);

  insert into devices (user_id, expo_push_token, platform) values
    ('${AMMA}', 'ExponentPushToken[amma-1]', 'android'),
    ('${AMMA}', 'ExponentPushToken[amma-2]', 'ios');
`;

async function withSeed(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(seed);
  return db;
}

describe("get_push_tokens_for_user", () => {
  it("returns tokens for the given user", async () => {
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

  it("returns empty for a user with no devices", async () => {
    const db = await withSeed();
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
});
