import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

async function withUser(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(`insert into users (id, phone_hash) values ('${AMMA}', 'hash-amma');`);
  return db;
}

describe("check_lookup_rate_limit", () => {
  it("allows a call under every ceiling", async () => {
    const db = await withUser();
    const result = await db.asUser(
      AMMA,
      `select check_lookup_rate_limit('device-1', '1.2.3.4') as allowed`
    );
    expect(result).toEqual([{ allowed: true }]);
    await db.close();
  });

  it("refuses the 21st call from the same account within a minute", async () => {
    // device_key and ip vary per call so this isolates the per-account
    // ceiling alone - reusing a fixed device/ip here would let the
    // per-device or per-IP ceiling mask a broken per-account check.
    const db = await withUser();
    for (let i = 0; i < 20; i++) {
      await db.asUser(AMMA, `select check_lookup_rate_limit('device-${i}', 'ip-${i}')`);
    }
    const result = await db.asUser(
      AMMA,
      `select check_lookup_rate_limit('device-final', 'ip-final') as allowed`
    );
    expect(result).toEqual([{ allowed: false }]);
    await db.close();
  });

  it("refuses the 21st call from the same device even under a different account", async () => {
    // Per-account alone is bypassed by making more accounts - the device
    // dimension must catch this independently.
    const db = await createSchemaTestDb();
    for (let i = 0; i < 21; i++) {
      const id = `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
      await db.asService(`insert into users (id, phone_hash) values ('${id}', 'hash-${i}');`);
      await db.asUser(id, `select check_lookup_rate_limit('same-device', '1.2.3.4')`);
    }
    const finalId = "00000000-0000-0000-0000-000000000099";
    await db.asService(`insert into users (id, phone_hash) values ('${finalId}', 'hash-final');`);
    const result = await db.asUser(
      finalId,
      `select check_lookup_rate_limit('same-device', '1.2.3.4') as allowed`
    );
    expect(result).toEqual([{ allowed: false }]);
    await db.close();
  });

  it("refuses the 101st call from the same IP within a minute, across accounts", async () => {
    const db = await createSchemaTestDb();
    for (let i = 0; i < 101; i++) {
      const id = `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
      await db.asService(`insert into users (id, phone_hash) values ('${id}', 'hash-ip-${i}');`);
      await db.asUser(id, `select check_lookup_rate_limit('device-${i}', 'same-ip')`);
    }
    const finalId = "10000000-0000-0000-0000-000000000199";
    await db.asService(`insert into users (id, phone_hash) values ('${finalId}', 'hash-ip-final');`);
    const result = await db.asUser(
      finalId,
      `select check_lookup_rate_limit('device-final', 'same-ip') as allowed`
    );
    expect(result).toEqual([{ allowed: false }]);
    await db.close();
  });

  it("refuses the 501st call from the same account within a day even spread across minutes", async () => {
    // Simulate by inserting rows directly at varied timestamps within the
    // last 24h (as service), since the per-minute ceiling would otherwise
    // block us from generating 500 real calls in test time.
    const db = await withUser();
    const rows = Array.from({ length: 500 }, (_, i) =>
      `('${AMMA}', 'device-day', 'ip-day', now() - interval '${i} minutes')`
    ).join(",\n");
    await db.asService(
      `insert into lookup_rate_limits (caller_id, device_key, ip, looked_up_at) values ${rows};`
    );
    const result = await db.asUser(
      AMMA,
      `select check_lookup_rate_limit('device-day-new', 'ip-day-new') as allowed`
    );
    expect(result).toEqual([{ allowed: false }]);
    await db.close();
  });

  it("refuses an unauthenticated caller", async () => {
    const db = await withUser();
    await expect(
      db.asAnon(`select check_lookup_rate_limit('device-1', '1.2.3.4')`)
    ).rejects.toThrow();
    await db.close();
  });
});
