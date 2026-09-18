import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";

/**
 * White-box finding W1 - self_register() reopens the identity defect that
 * claimInvitations.test.ts's own header names as the attack the design exists
 * to stop: "register with someone else's number, then collect every
 * invitation addressed to it".
 *
 * bind_via_invite_token() forbids an account that already holds a number from
 * moving to a different one ("this caller holds no OTHER number already").
 * self_register() does not: its only collision guard looks at OTHER accounts
 * (`u.id <> caller`), so the caller's own phone_hash is overwritten
 * unconditionally by the upsert. An account that was bound by the rung-1
 * credential can therefore re-point itself at any number nobody has
 * registered yet, and claim_invitations() - which trusts users.phone_hash -
 * then hands over that number's pending mail, content included.
 *
 * self_register() also skips the stale-mail purge that bind_via_invite_token()
 * runs for a fresh bind, so nothing narrows the window either.
 *
 * Both tests below use `it.fails`: they assert the SAFE behaviour and are
 * expected to fail today. They turn red when the defect is repaired, which is
 * the signal to delete the `.fails`.
 */
describe("self_register - W1 identity re-point", () => {
  it.fails("does not let a token-bound account move to a different number", async () => {
    const db = await createSchemaTestDb();
    // Amma is bound to her own number, the way bind_via_invite_token leaves her.
    await db.asService(
      `insert into users (id, phone_hash) values ('${AMMA}', 'hash-amma')`
    );

    // Nobody has registered Anand's number yet, so the "already registered to
    // a different account" guard does not fire.
    await expect(
      db.asUser(AMMA, `select * from self_register('hash-anand')`)
    ).rejects.toThrow(/already bound|already registered/i);

    await db.close();
  });

  it.fails("does not hand over another number's pending invitations", async () => {
    const db = await createSchemaTestDb();
    await db.asService(`
      insert into users (id, phone_hash) values
        ('${AMMA}', 'hash-amma'),
        ('${STRANGER}', 'hash-stranger');
      insert into invitations
        (sender_id, recipient_phone_hash, recipient_id, title, status, datetime,
         original_datetime, expires_at, content_expires_at)
      values
        ('${STRANGER}', 'hash-anand', null, 'Take BP tablets', 'invited',
         now() + interval '1 hour', now() + interval '1 hour',
         now() + interval '1 hour', now() + interval '1 hour');
    `);

    // Amma asserts a number she does not control. Nothing proves she does.
    await db.asUser(AMMA, `select * from self_register('hash-anand')`);
    const claimed = await db.asUser(AMMA, `select * from claim_invitations()`);

    // Anand's mail must not reach her.
    expect(claimed).toHaveLength(0);

    await db.close();
  });
});

/**
 * White-box finding W3 - respond_to_invitation() takes the accepted datetime
 * verbatim from the recipient, with no bound of any kind.
 *
 * The sender's own device applies that value: the invitation_time_changed
 * push drives applyRecipientTimeChangeByInvitationId(), which cancels the
 * sender's scheduled notification and re-arms at the new time. A time already
 * in the past cannot be re-armed, so the sender's reminder is left rewritten
 * and silently unscheduled - a recipient can disarm a reminder that was never
 * theirs to edit.
 */
describe("respond_to_invitation - W3 unbounded accepted datetime", () => {
  it.fails("rejects an accepted datetime in the past", async () => {
    const db = await createSchemaTestDb();
    await db.asService(`
      insert into users (id, phone_hash) values
        ('${ANAND}', 'hash-anand'),
        ('${AMMA}', 'hash-amma');
      insert into invitations
        (sender_id, recipient_phone_hash, recipient_id, title, status, datetime,
         original_datetime, expires_at, content_expires_at)
      values
        ('${ANAND}', 'hash-amma', '${AMMA}', 'Take BP tablets', 'invited',
         now() + interval '1 hour', now() + interval '1 hour',
         now() + interval '1 hour', now() + interval '1 hour');
    `);
    const [inv] = await db.asService(`select id from invitations limit 1`);

    await expect(
      db.asUser(
        AMMA,
        `select * from respond_to_invitation('${inv.id}'::uuid, 'accepted',
           now() - interval '10 years')`
      )
    ).rejects.toThrow(/datetime|past|invalid/i);

    await db.close();
  });
});
