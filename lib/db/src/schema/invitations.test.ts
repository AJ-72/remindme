import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

const CLAIMED = "aaaaaaaa-0000-4000-8000-000000000001";
const UNCLAIMED = "aaaaaaaa-0000-4000-8000-000000000002";

async function withInvitations(): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash) values
      ('${ANAND}', 'hash-anand'),
      ('${AMMA}', 'hash-amma'),
      ('${STRANGER}', 'hash-stranger');
    insert into invitations
      (id, sender_id, recipient_phone_hash, recipient_id, title, datetime,
       original_datetime, expires_at, content_expires_at)
    values
      ('${CLAIMED}', '${ANAND}', 'hash-amma', '${AMMA}', 'Take BP tablets',
       now() + interval '1 hour', now() + interval '1 hour',
       now() + interval '1 hour', now() + interval '1 hour'),
      ('${UNCLAIMED}', '${ANAND}', 'hash-nobody', null, 'Call the clinic',
       now() + interval '2 hours', now() + interval '2 hours',
       now() + interval '2 hours', now() + interval '2 hours');
  `);
  return db;
}

describe("invitations RLS", () => {
  it("shows the sender what they sent", async () => {
    const db = await withInvitations();
    await expect(
      db.asUser(ANAND, "select count(*)::int as n from invitations")
    ).resolves.toEqual([{ n: 2 }]);
    await db.close();
  });

  it("shows the recipient an invitation addressed to them", async () => {
    const db = await withInvitations();
    await expect(db.asUser(AMMA, "select title from invitations")).resolves.toEqual([
      { title: "Take BP tablets" },
    ]);
    await db.close();
  });

  it("shows an uninvolved user nothing", async () => {
    // Reminder text is health data as often as not - "take your BP tablets",
    // "call the oncologist". A leak here is a different product from the one
    // being sold.
    const db = await withInvitations();
    await expect(db.asUser(STRANGER, "select * from invitations")).resolves.toEqual([]);
    await db.close();
  });

  it("hides an unclaimed invitation from the person it is addressed to", async () => {
    // Not a bug - the reason the claim function has to exist. An unclaimed
    // row is owned by nobody, so no row-ownership policy can reach it, and
    // any policy that did would be an enumeration oracle: "show me rows for
    // this hash" answers "is this number registered?" for every number.
    //
    // Claiming therefore runs through a SECURITY DEFINER function with its
    // own checks. This test pins the gap that function fills.
    const db = await createSchemaTestDb();
    await db.asService(`
      insert into users (id, phone_hash) values
        ('${ANAND}', 'hash-anand'), ('${AMMA}', 'hash-amma');
      insert into invitations
        (sender_id, recipient_phone_hash, title, datetime, original_datetime,
         expires_at, content_expires_at)
      values ('${ANAND}', 'hash-amma', 'Take BP tablets', now(), now(), now(), now());
    `);
    await expect(db.asUser(AMMA, "select * from invitations")).resolves.toEqual([]);
    await db.close();
  });

  it("refuses a client-written invitation", async () => {
    // Sending must check the recipient's block list and mute switch, and the
    // sender can read neither. A direct INSERT would walk straight past both,
    // so sending is a server operation and the privilege is withheld.
    const db = await withInvitations();
    await expect(
      db.asUser(
        ANAND,
        `insert into invitations
           (sender_id, recipient_phone_hash, title, datetime, original_datetime,
            expires_at, content_expires_at)
         values ('${ANAND}', 'hash-amma', 'spam', now(), now(), now(), now())`
      )
    ).rejects.toThrow(/permission denied/i);
    await db.close();
  });

  it("refuses a client-written status change", async () => {
    // Accept, decline, reschedule and cancel each have to notify the other
    // party and enforce who may change what: the sender may only cancel, the
    // recipient may reschedule. That asymmetry compares the old row to the
    // new one, which RLS cannot see - so every transition is a server
    // operation and no UPDATE is granted here at all.
    const db = await withInvitations();
    await expect(
      db.asUser(AMMA, `update invitations set status = 'accepted' where id = '${CLAIMED}'`)
    ).rejects.toThrow(/permission denied/i);
    await db.close();
  });

  it("refuses a recipient rewriting the reminder's time directly", async () => {
    const db = await withInvitations();
    await expect(
      db.asUser(AMMA, `update invitations set datetime = now() where id = '${CLAIMED}'`)
    ).rejects.toThrow(/permission denied/i);
    await db.close();
  });

  it("keeps an invitation addressed to an unregistered number", async () => {
    // recipient_phone_hash is deliberately not a foreign key. That is what
    // lets the mailbox hold something for a person who has no account yet,
    // and it is the whole mechanism behind self-claiming registration.
    const db = await withInvitations();
    await expect(
      db.asService(
        `select recipient_id from invitations where recipient_phone_hash = 'hash-nobody'`
      )
    ).resolves.toEqual([{ recipient_id: null }]);
    await db.close();
  });
});
