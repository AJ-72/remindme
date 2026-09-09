import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

async function withInvitation(status = "invited"): Promise<{ db: RlsTestDb; invitationId: string }> {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash) values
      ('${ANAND}', 'hash-anand'), ('${AMMA}', 'hash-amma'), ('${STRANGER}', 'hash-stranger');
  `);
  const rows = await db.asService(`
    insert into invitations
      (sender_id, recipient_id, recipient_phone_hash, title, description, status,
       datetime, original_datetime, expires_at, content_expires_at)
    values
      ('${ANAND}', '${AMMA}', 'hash-amma', 'Take BP tablets', 'After breakfast', '${status}',
       now() + interval '2 hours', now() + interval '2 hours',
       now() + interval '2 hours', now() + interval '2 hours')
    returning id;
  `);
  return { db, invitationId: (rows[0] as { id: string }).id };
}

describe("respond_to_invitation", () => {
  it("accepting sets status=accepted and nulls title/description, keeping the row", async () => {
    const { db, invitationId } = await withInvitation();
    const result = await db.asUser(
      AMMA,
      `select status, title, description from respond_to_invitation('${invitationId}', 'accepted')`
    );
    expect(result).toEqual([{ status: "accepted", title: null, description: null }]);
    await db.close();
  });

  it("declining sets status=declined and nulls content too", async () => {
    const { db, invitationId } = await withInvitation();
    const result = await db.asUser(
      AMMA,
      `select status, title from respond_to_invitation('${invitationId}', 'declined')`
    );
    expect(result).toEqual([{ status: "declined", title: null }]);
    await db.close();
  });

  it("refuses a caller who is not the recipient", async () => {
    const { db, invitationId } = await withInvitation();
    await expect(
      db.asUser(STRANGER, `select * from respond_to_invitation('${invitationId}', 'accepted')`)
    ).rejects.toThrow();
    await db.close();
  });

  it("refuses the sender responding to their own invitation", async () => {
    const { db, invitationId } = await withInvitation();
    await expect(
      db.asUser(ANAND, `select * from respond_to_invitation('${invitationId}', 'accepted')`)
    ).rejects.toThrow();
    await db.close();
  });

  it("refuses responding to an invitation already in a terminal state", async () => {
    const { db, invitationId } = await withInvitation("accepted");
    await expect(
      db.asUser(AMMA, `select * from respond_to_invitation('${invitationId}', 'declined')`)
    ).rejects.toThrow();
    await db.close();
  });

  it("refuses an invalid response value", async () => {
    const { db, invitationId } = await withInvitation();
    await expect(
      db.asUser(AMMA, `select * from respond_to_invitation('${invitationId}', 'maybe')`)
    ).rejects.toThrow();
    await db.close();
  });

  it("refuses an unauthenticated caller", async () => {
    const { db, invitationId } = await withInvitation();
    await expect(
      db.asAnon(`select * from respond_to_invitation('${invitationId}', 'accepted')`)
    ).rejects.toThrow();
    await db.close();
  });
});
