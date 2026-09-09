import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { ANAND } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

async function withSender(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(`insert into users (id, phone_hash) values ('${ANAND}', 'hash-anand');`);
  return db;
}

describe("check_first_contact_rate_limit", () => {
  it("allows the first invitation to a brand-new recipient hash", async () => {
    const db = await withSender();
    const result = await db.asUser(
      ANAND,
      `select check_first_contact_rate_limit('${ANAND}', 'hash-new-1') as allowed`
    );
    expect(result).toEqual([{ allowed: true }]);
    await db.close();
  });

  it("allows the 11th message to a recipient the sender already has an invitation with", async () => {
    const db = await withSender();
    // 10 prior invitations to 10 distinct new recipients, filling the ceiling.
    for (let i = 0; i < 10; i++) {
      await db.asService(`
        insert into invitations
          (sender_id, recipient_phone_hash, title, status, datetime, original_datetime, expires_at, content_expires_at)
        values ('${ANAND}', 'hash-distinct-${i}', 'X', 'invited', now() + interval '1 hour',
                now() + interval '1 hour', now() + interval '1 hour', now() + interval '1 hour');
      `);
    }
    // Sending AGAIN to an already-contacted recipient (hash-distinct-0) must
    // still be allowed - the ceiling is about NEW contacts, not volume.
    const result = await db.asUser(
      ANAND,
      `select check_first_contact_rate_limit('${ANAND}', 'hash-distinct-0') as allowed`
    );
    expect(result).toEqual([{ allowed: true }]);
    await db.close();
  });

  it("refuses the 11th distinct new recipient within 24 hours", async () => {
    const db = await withSender();
    for (let i = 0; i < 10; i++) {
      await db.asService(`
        insert into invitations
          (sender_id, recipient_phone_hash, title, status, datetime, original_datetime, expires_at, content_expires_at)
        values ('${ANAND}', 'hash-distinct-${i}', 'X', 'invited', now() + interval '1 hour',
                now() + interval '1 hour', now() + interval '1 hour', now() + interval '1 hour');
      `);
    }
    const result = await db.asUser(
      ANAND,
      `select check_first_contact_rate_limit('${ANAND}', 'hash-brand-new') as allowed`
    );
    expect(result).toEqual([{ allowed: false }]);
    await db.close();
  });
});
