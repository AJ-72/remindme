import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

/**
 * Rung 1 of the verification ladder: possession of the invite link is proof
 * of number control. This is the path that removes the OTP step from the
 * user who can least absorb it - Amma taps Anand's link and is bound with no
 * verification screen at all.
 *
 * Structurally the same risk class as claim_invitations(): it reads a row
 * nobody owns yet, so it is SECURITY DEFINER, and it is the function that
 * would reintroduce number squatting if any check here were wrong.
 */

const seed = `
  insert into users (id, phone_hash, display_name) values
    ('${ANAND}', 'hash-anand', 'Anand');
`;

async function withInvitation(opts: { expiresIn?: string } = {}): Promise<{
  db: RlsTestDb;
  token: string;
}> {
  const db = await createSchemaTestDb();
  await db.asService(seed);
  const expires = opts.expiresIn ?? "1 hour";
  const [row] = await db.asService(`
    insert into invitations
      (sender_id, recipient_phone_hash, title, datetime, original_datetime,
       expires_at, content_expires_at)
    values ('${ANAND}', 'hash-amma', 'Take BP tablets', now() + interval '${expires}',
            now() + interval '${expires}', now() + interval '${expires}',
            now() + interval '${expires}')
    returning bind_token;
  `);
  return { db, token: row.bind_token as string };
}

describe("bind_via_invite_token", () => {
  it("binds the caller's account to the invitation's phone number", async () => {
    const { db, token } = await withInvitation();
    const [bound] = await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    expect(bound.phone_hash).toBe("hash-amma");
    expect(bound.id).toBe(AMMA);
    await db.close();
  });

  it("persists the binding, visible to the caller afterwards", async () => {
    const { db, token } = await withInvitation();
    await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    await expect(db.asUser(AMMA, "select phone_hash from users")).resolves.toEqual([
      { phone_hash: "hash-amma" },
    ]);
    await db.close();
  });

  it("is idempotent across repeated calls from the same account", async () => {
    // People tap twice, and a device that loses its response retries. This is
    // what makes a re-tap safe rather than an error or a takeover attempt.
    const { db, token } = await withInvitation();
    await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    const [bound] = await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    expect(bound.phone_hash).toBe("hash-amma");
    await expect(
      db.asService("select count(*)::int as n from users")
    ).resolves.toEqual([{ n: 2 }]); // Anand (seeded) + Amma once, not twice.
    await db.close();
  });

  it("refuses a second account trying to consume an already-bound token", async () => {
    // Single-use: once one account has bound this number, the token cannot
    // hand the same number to somebody else. Re-verifying a lost device is
    // rung 2 (OTP) - "there is no invite link on a migration" - never a
    // second tap of rung 1 from a different device key.
    const { db, token } = await withInvitation();
    await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    await expect(
      db.asUser(STRANGER, `select * from bind_via_invite_token('${token}')`)
    ).rejects.toThrow(/already bound/i);
    await db.close();
  });

  it("refuses an account already bound to a different number", async () => {
    // v1 accepts one number per account (see the dual-SIM section of the
    // spec). Silently overwriting would let one invite link reassign an
    // established identity's number.
    const { db, token } = await withInvitation();
    await db.asService(`insert into users (id, phone_hash) values ('${AMMA}', 'hash-other')`);
    await expect(
      db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`)
    ).rejects.toThrow(/already bound/i);
    await db.close();
  });

  it("refuses an unknown token", async () => {
    const { db } = await withInvitation();
    const bogus = "00000000-0000-4000-8000-000000000000";
    await expect(
      db.asUser(AMMA, `select * from bind_via_invite_token('${bogus}')`)
    ).rejects.toThrow(/invalid token/i);
    await db.close();
  });

  it("refuses a token whose invitation has already expired", async () => {
    const { db, token } = await withInvitation({ expiresIn: "-1 hour" });
    await expect(
      db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`)
    ).rejects.toThrow(/expired/i);
    await db.close();
  });

  it("refuses an anonymous caller", async () => {
    const { db, token } = await withInvitation();
    await expect(db.asAnon(`select * from bind_via_invite_token('${token}')`)).rejects.toThrow(
      /permission denied/i
    );
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    // Same rot risk as claim_invitations(): without this, the in-body auth
    // check is unreachable and untestable, so it could be deleted silently.
    const { db, token } = await withInvitation();
    await db.asService("grant execute on function bind_via_invite_token(uuid) to anon;");
    await expect(db.asAnon(`select * from bind_via_invite_token('${token}')`)).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });

  it("is not hijackable through the caller's search_path", async () => {
    const { db, token } = await withInvitation();
    await db.asService(`
      create schema evil2;
      create table evil2.invitations (like public.invitations including all);
      create table evil2.users (like public.users including all);
      grant usage on schema evil2 to authenticated;
      grant select on evil2.invitations, evil2.users to authenticated;
    `);
    const [bound] = await db.asUser(
      AMMA,
      `select * from public.bind_via_invite_token('${token}')`,
      { searchPath: "evil2, public" }
    );
    expect(bound.phone_hash).toBe("hash-amma");
    await db.close();
  });
});
