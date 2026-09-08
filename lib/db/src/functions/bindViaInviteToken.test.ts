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
    // A weaker version of this test once existed: an EMPTY planted table, so
    // a hijack that read nothing and a correctly-qualified function that read
    // the real row were indistinguishable - both returned "hash-amma" and the
    // test passed either way. The only thing that catches a hijack is a
    // planted row that would answer DIFFERENTLY if read.
    const { db, token } = await withInvitation();
    await db.asService(`
      create schema evil2;
      create table evil2.invitations (like public.invitations including all);
      create table evil2.users (like public.users including all);
      grant usage on schema evil2 to authenticated;
      grant select, insert on evil2.invitations, evil2.users to authenticated;
      insert into evil2.invitations
        (sender_id, recipient_phone_hash, bind_token, title, datetime,
         original_datetime, expires_at, content_expires_at)
      values ('${ANAND}', 'hash-planted', '${token}', 'planted',
              now() + interval '1 hour', now() + interval '1 hour',
              now() + interval '1 hour', now() + interval '1 hour');
    `);

    const [bound] = await db.asUser(
      AMMA,
      `select * from public.bind_via_invite_token('${token}')`,
      { searchPath: "evil2, public" }
    );
    expect(bound.phone_hash).toBe("hash-amma"); // not hash-planted

    // And the mutation landed on the REAL invitation. If it had landed on the
    // planted one instead, the real token would stay unconsumed and a second
    // account could later bind it for free.
    await expect(
      db.asService(`select bound_by from invitations where bind_token = '${token}'`)
    ).resolves.toEqual([{ bound_by: AMMA }]);
    await db.close();
  });

  it("does not also claim - recipient_id stays null after a bind", async () => {
    // The narrowness this function documents about itself: binding proves
    // identity, it does not collect mail. A test that never checks this could
    // let the two silently merge in a later edit with nothing failing.
    const { db, token } = await withInvitation();
    await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    await expect(
      db.asService(`select recipient_id from invitations where bind_token = '${token}'`)
    ).resolves.toEqual([{ recipient_id: null }]);
    await db.close();
  });

  it("returns exactly the caller's own row, even with other users present", async () => {
    const { db, token } = await withInvitation();
    await db.asService(`insert into users (id, phone_hash) values ('${STRANGER}', 'hash-stranger')`);
    const bound = await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    expect(bound).toHaveLength(1);
    expect(bound[0].id).toBe(AMMA);
    await db.close();
  });

  it("refuses to bind against an invitation whose content has already been purged", async () => {
    // Mirrors claim_invitations()'s content-retention guard. A token bound
    // against a row whose title/description are already gone would still
    // mint a real identity from stale mail no reminder ever attaches to.
    const { db } = await withInvitation();
    const [row] = await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, title, datetime, original_datetime,
         expires_at, content_expires_at)
      values ('${ANAND}', 'hash-amma', null, now() + interval '60 days',
              now() + interval '60 days', now() + interval '60 days',
              now() - interval '1 day')
      returning bind_token;
    `);
    await expect(
      db.asUser(AMMA, `select * from bind_via_invite_token('${row.bind_token}')`)
    ).rejects.toThrow(/expired/i);
    await db.close();
  });

  it("is idempotent across two DIFFERENT invitations' tokens for the same number", async () => {
    // The common case: a sender sends more than one reminder before the
    // recipient ever installs. Each invitation carries its own bind_token,
    // and the second one used must succeed silently rather than treating an
    // already-bound account as a conflict.
    const { db, token: firstToken } = await withInvitation();
    await db.asUser(AMMA, `select * from bind_via_invite_token('${firstToken}')`);

    const [row] = await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, title, datetime, original_datetime,
         expires_at, content_expires_at)
      values ('${ANAND}', 'hash-amma', 'Call the clinic', now() + interval '2 hours',
              now() + interval '2 hours', now() + interval '2 hours',
              now() + interval '2 hours')
      returning bind_token;
    `);
    const [bound] = await db.asUser(
      AMMA,
      `select * from bind_via_invite_token('${row.bind_token}')`
    );
    expect(bound.phone_hash).toBe("hash-amma");
    await db.close();
  });

  it("does not care about the invitation's own status", async () => {
    // Deliberate, and now explicit rather than silent: binding proves control
    // of a NUMBER via a link that was genuinely delivered to it. Whether this
    // particular reminder was since cancelled, declined or expired says
    // nothing about whether the phone that received the link still controls
    // that number - and claim_invitations() already refuses non-'invited'
    // rows on the mail side, so a cancelled invitation cannot be exploited to
    // collect anything through this door.
    const { db } = await withInvitation();
    const [row] = await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, status, title, datetime,
         original_datetime, expires_at, content_expires_at)
      values ('${ANAND}', 'hash-amma', 'cancelled', 'Take BP tablets',
              now() + interval '1 hour', now() + interval '1 hour',
              now() + interval '1 hour', now() + interval '1 hour')
      returning bind_token;
    `);
    const [bound] = await db.asUser(
      AMMA,
      `select * from bind_via_invite_token('${row.bind_token}')`
    );
    expect(bound.phone_hash).toBe("hash-amma");
    await db.close();
  });

  it("stays refused for a stranger even after the original binder deletes their account", async () => {
    // The bug this whole rewrite exists to close. single-use used to be
    // INFERRED from users.phone_hash being unique - a proxy that dies with
    // the account, since account deletion is a stated Play Store requirement
    // and binding does not claim (so the invitation has no recipient_id to
    // cascade the delete through). bound_by lives on the invitation itself
    // and must survive the bound account's deletion.
    const { db, token } = await withInvitation();
    await db.asUser(AMMA, `select * from bind_via_invite_token('${token}')`);
    await db.asUser(AMMA, "delete from users");
    await expect(
      db.asService("select count(*)::int as n from users")
    ).resolves.toEqual([{ n: 1 }]); // Anand only - Amma's row is gone.

    await expect(
      db.asUser(STRANGER, `select * from bind_via_invite_token('${token}')`)
    ).rejects.toThrow(/already bound/i);
    await db.close();
  });

  it("purges unclaimed invitations for the hash on a FRESH bind (recycled-number gap)", async () => {
    const { db } = await withInvitation();
    const staleToken = "11111111-1111-1111-1111-111111111111";
    await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, bind_token, title, status, datetime,
         original_datetime, expires_at, content_expires_at)
      values
        ('${ANAND}', 'hash-recycled', '${staleToken}', 'Old message for the previous owner',
         'invited', now() + interval '1 hour', now() + interval '1 hour',
         now() + interval '1 hour', now() + interval '1 hour');
    `);

    // A DIFFERENT token, bound by STRANGER (a fresh account, never bound before),
    // to the SAME recycled hash.
    const freshToken = "22222222-2222-2222-2222-222222222222";
    await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, bind_token, title, status, datetime,
         original_datetime, expires_at, content_expires_at)
      values
        ('${ANAND}', 'hash-recycled', '${freshToken}', 'Welcome message',
         'invited', now() + interval '1 hour', now() + interval '1 hour',
         now() + interval '1 hour', now() + interval '1 hour');
    `);

    await db.asUser(STRANGER, `select * from bind_via_invite_token('${freshToken}')`);

    // The stale invitation (addressed to whoever held the number before) must
    // no longer be claimable by the new owner.
    const remaining = await db.asService(
      `select bind_token from invitations where bind_token = '${staleToken}'`
    );
    expect(remaining).toEqual([]);
    await db.close();
  });

  it("does NOT purge other invitations when the SAME account re-binds (idempotent re-tap)", async () => {
    const { db } = await withInvitation();
    const token = "33333333-3333-3333-3333-333333333333";
    await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, bind_token, title, status, datetime,
         original_datetime, expires_at, content_expires_at)
      values
        ('${ANAND}', 'hash-repeat', '${token}', 'Message', 'invited',
         now() + interval '1 hour', now() + interval '1 hour',
         now() + interval '1 hour', now() + interval '1 hour');
    `);
    await db.asUser(STRANGER, `select * from bind_via_invite_token('${token}')`);

    // A second, unrelated pending invitation for the SAME hash, arriving after
    // the bind. Re-tapping the same token again must not purge this - it is
    // not "fresh", the account already exists.
    const secondToken = "44444444-4444-4444-4444-444444444444";
    await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, bind_token, title, status, datetime,
         original_datetime, expires_at, content_expires_at)
      values
        ('${ANAND}', 'hash-repeat', '${secondToken}', 'Newer message', 'invited',
         now() + interval '1 hour', now() + interval '1 hour',
         now() + interval '1 hour', now() + interval '1 hour');
    `);

    await db.asUser(STRANGER, `select * from bind_via_invite_token('${token}')`); // re-tap

    const stillThere = await db.asService(
      `select bind_token from invitations where bind_token = '${secondToken}'`
    );
    expect(stillThere).toEqual([{ bind_token: secondToken }]);
    await db.close();
  });

  // Concurrency: two callers racing the same token cannot both be tested here
  // - the PGlite harness runs one transaction at a time, so there is no way
  // to construct a genuine race in this suite. The claim is a single atomic
  // UPDATE whose WHERE clause is re-evaluated under the row lock Postgres
  // takes for it, which is what makes two concurrent claims serialize rather
  // than both reading a still-unbound row and both writing. See the comment
  // above the UPDATE in bindViaInviteToken.sql for the reasoning; there is no
  // test for it because there is no way to write one truthfully against this
  // harness.
});
