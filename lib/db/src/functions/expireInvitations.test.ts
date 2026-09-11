import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

async function withInvitations(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash) values ('${ANAND}', 'hash-anand'), ('${AMMA}', 'hash-amma');
    insert into invitations
      (sender_id, recipient_phone_hash, title, description, status, datetime,
       original_datetime, expires_at, content_expires_at)
    values
      ('${ANAND}', 'hash-amma', 'Overdue', 'X', 'invited', now() - interval '1 hour',
       now() - interval '1 hour', now() - interval '1 hour', now() + interval '1 day'),
      ('${ANAND}', 'hash-amma', 'Still pending', 'Y', 'invited', now() + interval '1 hour',
       now() + interval '1 hour', now() + interval '1 hour', now() + interval '1 day'),
      ('${ANAND}', 'hash-amma', 'Already accepted', 'Z', 'accepted', now() - interval '1 hour',
       now() - interval '1 hour', now() - interval '1 hour', now() + interval '1 day');
  `);
  return db;
}

describe("expire_invitations", () => {
  it("expires only invited rows past their expires_at, nulling content", async () => {
    const db = await withInvitations();
    await db.asService(`select expire_invitations()`);
    // Ordered by description (never touched by the sweep, unlike title,
    // which the overdue row loses) rather than created_at: all three seed
    // rows land in one multi-row insert and can share the same created_at
    // timestamp, which is not a stable sort key in Postgres.
    const rows = await db.asService(
      `select title, status from invitations order by description`
    );
    expect(rows).toEqual([
      { title: "Still pending", status: "invited" }, // Y: not yet due
      { title: "Already accepted", status: "accepted" }, // Z: already terminal, untouched
      { title: null, status: "expired" }, // X: was overdue+invited (description also nulled, sorts last)
    ]);
    await db.close();
  });

  it("refuses a caller who is not the service role", async () => {
    // PGlite's harness has no `service_role` role to authenticate as (see
    // rlsHarness.ts: only `authenticated`/`anon` are switched to by
    // asUser/asAnon; asService runs as the owning superuser and bypasses
    // grants entirely, so it cannot be used to assert a security property -
    // see its own docstring). The function's EXECUTE privilege is granted
    // only to `service_role`, so the property under test - "an ordinary
    // authenticated caller cannot invoke this maintenance sweep" - is
    // exercised via the ordinary Postgres privilege system: asUser has no
    // EXECUTE grant here and must be refused, exactly as it would be for any
    // authenticated/anon caller on the real database.
    const db = await withInvitations();
    await expect(db.asUser(ANAND, `select expire_invitations()`)).rejects.toThrow();
    await db.close();
  });
});
