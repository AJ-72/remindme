import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

/**
 * The claim function is the most attack-exposed code in the design.
 *
 * It reads rows nobody owns yet, so no row-ownership policy can protect it,
 * and it is precisely the endpoint the identity defect in the first draft of
 * the spec abused: register with someone else's number, then collect every
 * invitation addressed to it.
 */

const seed = `
  insert into users (id, phone_hash, display_name) values
    ('${ANAND}', 'hash-anand', 'Anand'),
    ('${AMMA}', 'hash-amma', 'Amma'),
    ('${STRANGER}', 'hash-stranger', 'Stranger');
`;

function invitation(opts: {
  hash: string;
  title?: string;
  recipient?: string | null;
  status?: string;
  expiresIn?: string;
}) {
  const recipient = opts.recipient ? `'${opts.recipient}'` : "null";
  const expires = opts.expiresIn ?? "1 hour";
  return `
    insert into invitations
      (sender_id, recipient_phone_hash, recipient_id, title, status, datetime,
       original_datetime, expires_at, content_expires_at)
    values
      ('${ANAND}', '${opts.hash}', ${recipient}, '${opts.title ?? "Take BP tablets"}',
       '${opts.status ?? "invited"}', now() + interval '${expires}',
       now() + interval '${expires}', now() + interval '${expires}',
       now() + interval '${expires}');
  `;
}

async function withSeed(extra = ""): Promise<RlsTestDb> {
  const db = await createSchemaTestDb();
  await db.asService(seed + extra);
  return db;
}

describe("claim_invitations", () => {
  it("gives a user the invitations addressed to their number", async () => {
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    const claimed = await db.asUser(AMMA, "select title from claim_invitations()");
    expect(claimed).toEqual([{ title: "Take BP tablets" }]);
    await db.close();
  });

  it("attaches the claimed rows to the caller", async () => {
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    await db.asUser(AMMA, "select * from claim_invitations()");
    await expect(
      db.asUser(AMMA, "select recipient_id from invitations")
    ).resolves.toEqual([{ recipient_id: AMMA }]);
    await db.close();
  });

  it("does not give a user invitations addressed to someone else", async () => {
    // The whole point. Amma's invitation must be unreachable by anyone else,
    // whatever they know about her.
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    await expect(db.asUser(STRANGER, "select * from claim_invitations()")).resolves.toEqual(
      []
    );
    await db.close();
  });

  it("cannot be told which number to claim", async () => {
    // Structural, and the single most important property here. The function
    // takes NO argument: it reads the caller's own phone_hash from their user
    // row, which only the verified bind operation can write. An argument would
    // reintroduce the original defect wholesale - and would also make the
    // function an enumeration oracle for every number in India.
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    await expect(
      db.asUser(STRANGER, "select * from claim_invitations('hash-amma')")
    ).rejects.toThrow(/does not exist/i);
    await db.close();
  });

  it("does not re-claim an invitation someone already holds", async () => {
    const db = await withSeed(
      invitation({ hash: "hash-amma", recipient: AMMA, title: "Already hers" })
    );
    await expect(db.asUser(AMMA, "select * from claim_invitations()")).resolves.toEqual([]);
    await db.close();
  });

  it("is idempotent across repeated calls", async () => {
    // People tap twice, and a device that loses its response retries. A second
    // call must be a no-op rather than a duplicate or an error.
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    const first = await db.asUser(AMMA, "select id from claim_invitations()");
    const second = await db.asUser(AMMA, "select id from claim_invitations()");
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    await expect(
      db.asUser(AMMA, "select count(*)::int as n from invitations")
    ).resolves.toEqual([{ n: 1 }]);
    await db.close();
  });

  it("does not claim an invitation that has already expired", async () => {
    // An unaccepted reminder for 08:00 is meaningless at 08:01. Handing it
    // over on a late registration would arm a reminder for a moment that has
    // already passed.
    const db = await withSeed(invitation({ hash: "hash-amma", expiresIn: "-1 hour" }));
    await expect(db.asUser(AMMA, "select * from claim_invitations()")).resolves.toEqual([]);
    await db.close();
  });

  it("does not claim an invitation the sender already cancelled", async () => {
    const db = await withSeed(invitation({ hash: "hash-amma", status: "cancelled" }));
    await expect(db.asUser(AMMA, "select * from claim_invitations()")).resolves.toEqual([]);
    await db.close();
  });

  it("claims nothing for a user who has muted everyone", async () => {
    // "Don't let anyone remind me" has to hold for mail that arrived before
    // the switch was flipped, or the mute reads as broken the moment it is
    // turned on. The rows are left to expire on their own.
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    await db.asService(`update users set accepting_reminders = false where id = '${AMMA}'`);
    await expect(db.asUser(AMMA, "select * from claim_invitations()")).resolves.toEqual([]);
    await db.close();
  });

  it("does not claim an invitation whose content has already been purged", async () => {
    // Retention nulls title/description at content_expires_at - 30 days at
    // the outside - while the row itself lives on until its datetime. Handing
    // such a row over produces a reminder with nothing in it.
    //
    // It also narrows a real gap. An unclaimed invitation has a null
    // recipient_id and so does NOT cascade when the account for that number
    // is deleted, which would otherwise let a recycled number's new owner
    // claim mail addressed to its previous holder. Recycling takes 45+ days
    // and content is gone by 30, so this covers the realistic case - the
    // complete fix is purging unclaimed rows for a hash when a FRESH account
    // binds it, which belongs in bind. See the plan.
    const db = await withSeed();
    await db.asService(`
      insert into invitations
        (sender_id, recipient_phone_hash, title, datetime, original_datetime,
         expires_at, content_expires_at)
      values ('${ANAND}', 'hash-amma', null, now() + interval '60 days',
              now() + interval '60 days', now() + interval '60 days',
              now() - interval '1 day');
    `);
    await expect(db.asUser(AMMA, "select * from claim_invitations()")).resolves.toEqual([]);
    await db.close();
  });

  it("refuses an anonymous caller", async () => {
    // Refused at the grant layer: anon is never given EXECUTE. The next test
    // covers the case where someone loosens that.
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    await expect(db.asAnon("select * from claim_invitations()")).rejects.toThrow(
      /permission denied/i
    );
    await db.close();
  });

  it("still refuses an anonymous caller if EXECUTE is ever granted to anon", async () => {
    // Without this, the in-body auth check is unreachable and therefore
    // untested - sabotaging it away breaks nothing, which is how a guard rots
    // into a comment. It matters beyond a loosened grant: a SECURITY DEFINER
    // function invoked from a cron job or another function has no JWT, so
    // auth.uid() is null and the caller is nobody in particular.
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    await db.asService("grant execute on function claim_invitations() to anon;");
    await expect(db.asAnon("select * from claim_invitations()")).rejects.toThrow(
      /not authenticated/i
    );
    await db.close();
  });

  it("claims nothing for a caller with no account", async () => {
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    const orphan = "99999999-9999-4999-8999-999999999999";
    await expect(db.asUser(orphan, "select * from claim_invitations()")).resolves.toEqual([]);
    await db.close();
  });

  it("is not hijackable through the caller's search_path", async () => {
    // The classic SECURITY DEFINER exploit: the caller puts their own
    // `invitations` table earlier on the search path, and the function -
    // running as the owner, bypassing RLS - reads that instead.
    //
    // Two defences, and sabotage says what each is worth:
    //   - drop `public.` but keep the pinned search_path -> the function
    //     cannot resolve its tables at all, and nine tests fail loudly;
    //   - drop BOTH -> only THIS test fails, because the function silently
    //     returned the planted row.
    // So the pin turns a silent hijack into a crash, qualification is what
    // makes it correct, and this test is the only thing standing under the
    // combination. Do not delete it because the function looks qualified.
    const db = await withSeed(invitation({ hash: "hash-amma" }));
    await db.asService(`
      create schema evil;
      create table evil.invitations (like public.invitations including all);
      insert into evil.invitations
        (sender_id, recipient_phone_hash, title, datetime, original_datetime,
         expires_at, content_expires_at)
      values ('${ANAND}', 'hash-amma', 'planted', now(), now(), now(), now());
      grant usage on schema evil to authenticated;
      grant select on evil.invitations to authenticated;
    `);
    const claimed = await db.asUser(AMMA, "select title from public.claim_invitations()", {
      searchPath: "evil, public",
    });
    expect(claimed).toEqual([{ title: "Take BP tablets" }]);
    await db.close();
  });
});
