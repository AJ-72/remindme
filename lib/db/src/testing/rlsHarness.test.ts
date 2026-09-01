import { describe, expect, it } from "vitest";
import { createRlsTestDb } from "./rlsHarness";

/** A minimal table standing in for any RLS-protected table in the schema. */
const FIXTURE = `
  create table notes (id serial primary key, owner text not null, body text);
  alter table notes enable row level security;
  create policy own_notes on notes for select using (owner = auth.uid());
  insert into notes (owner, body) values ('anand', 'mine'), ('amma', 'hers');
`;

describe("createRlsTestDb", () => {
  it("lets a user read only their own rows", async () => {
    const db = await createRlsTestDb(FIXTURE);
    await expect(db.asUser("anand", "select body from notes")).resolves.toEqual([
      { body: "mine" },
    ]);
    await expect(db.asUser("amma", "select body from notes")).resolves.toEqual([
      { body: "hers" },
    ]);
    await db.close();
  });

  it("is not secretly running as a superuser", async () => {
    // The failure this whole harness exists to prevent. A superuser bypasses
    // RLS, so if the role switch ever breaks, every policy test would pass
    // while enforcing nothing. A table with RLS enabled and NO policy is
    // invisible to a normal user and fully visible to a superuser, so this
    // assertion fails loudly the moment that happens.
    const db = await createRlsTestDb(`
      create table locked (id serial primary key, secret text);
      alter table locked enable row level security;
      insert into locked (secret) values ('nobody should see this');
    `);
    await expect(db.asUser("anand", "select secret from locked")).resolves.toEqual([]);
    await expect(db.asUser("anand", "select current_user::text as who")).resolves.toEqual([
      { who: "authenticated" },
    ]);
    await db.close();
  });

  it("does not leak one caller's identity into the next query", async () => {
    // Identity is transaction-scoped. Were it session-scoped, a test that ran
    // as amma would silently colour every later query in the same file.
    const db = await createRlsTestDb(FIXTURE);
    await db.asUser("amma", "select body from notes");
    await expect(db.asAnon("select coalesce(auth.uid(), 'none') as uid")).resolves.toEqual([
      { uid: "none" },
    ]);
    await expect(db.asAnon("select body from notes")).resolves.toEqual([]);
    await db.close();
  });
});
