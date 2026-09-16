import { describe, expect, it } from "vitest";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { AMMA, ANAND, STRANGER } from "../testing/identities";
import type { RlsTestDb } from "../testing/rlsHarness";

async function withInvitation(): Promise<{ db: RlsTestDb; invitationId: string }> {
  const db = await createSchemaTestDb();
  await db.asService(`
    insert into users (id, phone_hash) values
      ('${ANAND}', 'hash-anand'), ('${AMMA}', 'hash-amma'), ('${STRANGER}', 'hash-stranger');

    insert into devices (user_id, expo_push_token, platform) values
      ('${ANAND}', 'ExponentPushToken[anand-1]', 'android');
  `);
  const rows = await db.asService(`
    insert into invitations
      (sender_id, recipient_id, recipient_phone_hash, datetime, original_datetime, expires_at, content_expires_at)
    values
      ('${ANAND}', '${AMMA}', 'hash-amma',
       now() + interval '2 hours', now() + interval '2 hours',
       now() + interval '2 hours', now() + interval '2 hours')
    returning id;
  `);
  return { db, invitationId: (rows[0] as { id: string }).id };
}

describe("get_sender_push_tokens", () => {
  it("returns the sender's tokens when the caller is the invitation's own recipient", async () => {
    const { db, invitationId } = await withInvitation();
    const result = await db.asUser(AMMA, `select * from get_sender_push_tokens('${invitationId}')`);
    expect(result).toEqual([{ expo_push_token: "ExponentPushToken[anand-1]" }]);
    await db.close();
  });

  it("refuses a caller who is not that invitation's recipient", async () => {
    const { db, invitationId } = await withInvitation();
    await expect(
      db.asUser(STRANGER, `select * from get_sender_push_tokens('${invitationId}')`)
    ).rejects.toThrow(/no such invitation/i);
    await db.close();
  });

  it("refuses the sender calling it about their own invitation", async () => {
    // get_push_tokens_for_user() already covers sender->recipient; this
    // function is the other direction only, and must not become a second
    // path to the same thing for the sender themselves.
    const { db, invitationId } = await withInvitation();
    await expect(
      db.asUser(ANAND, `select * from get_sender_push_tokens('${invitationId}')`)
    ).rejects.toThrow(/no such invitation/i);
    await db.close();
  });

  it("refuses an unauthenticated caller", async () => {
    const { db, invitationId } = await withInvitation();
    await expect(
      db.asAnon(`select * from get_sender_push_tokens('${invitationId}')`)
    ).rejects.toThrow();
    await db.close();
  });

  it("sabotage check: still refuses a non-recipient if EXECUTE is granted to anon", async () => {
    const { db, invitationId } = await withInvitation();
    await db.asService("grant execute on function get_sender_push_tokens(uuid) to anon;");
    await expect(
      db.asAnon(`select * from get_sender_push_tokens('${invitationId}')`)
    ).rejects.toThrow(/not authenticated/i);
    await db.close();
  });
});
