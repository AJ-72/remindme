import { describe, expect, it } from "vitest";
import { createRlsTestDb } from "./rlsHarness";

// auth.uid() is a uuid, as it is on Supabase. Named constants keep the tests
// readable without lying about the type.
const ANAND = "11111111-1111-4111-8111-111111111111";
const AMMA = "22222222-2222-4222-8222-222222222222";

/** A minimal table standing in for any RLS-protected table in the schema. */
const FIXTURE = `
  create table notes (id serial primary key, owner uuid not null, body text);
  alter table notes enable row level security;
  create policy own_notes on notes for select using (owner = auth.uid());
  insert into notes (owner, body) values
    ('${ANAND}', 'mine'), ('${AMMA}', 'hers');
`;

describe("createRlsTestDb", () => {
  it("lets a user read only their own rows", async () => {
    const db = await createRlsTestDb(FIXTURE);
    await expect(db.asUser(ANAND, "select body from notes")).resolves.toEqual([
      { body: "mine" },
    ]);
    await expect(db.asUser(AMMA, "select body from notes")).resolves.toEqual([
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
    await expect(db.asUser(ANAND, "select secret from locked")).resolves.toEqual([]);
    await expect(db.asUser(ANAND, "select current_user::text as who")).resolves.toEqual([
      { who: "authenticated" },
    ]);
    await db.close();
  });

  it("does not leak one caller's identity into the next query", async () => {
    // Identity is transaction-scoped. Were it session-scoped, a test that ran
    // as amma would silently colour every later query in the same file.
    const db = await createRlsTestDb(FIXTURE);
    await db.asUser(AMMA, "select body from notes");
    await expect(db.asAnon("select auth.uid() is null as anonymous")).resolves.toEqual([
      { anonymous: true },
    ]);
    await expect(db.asAnon("select body from notes")).resolves.toEqual([]);
    await db.close();
  });
});

describe("tablesWithoutRls", () => {
  it("names a table that forgot to enable RLS", async () => {
    // The guard that makes an unprotected table impossible to add quietly.
    // Drizzle only enables RLS on a table that declares a policy, so a new
    // table with none is wide open to every authenticated caller - and looks
    // completely normal in review.
    const db = await createRlsTestDb(`
      create table guarded (id serial primary key);
      alter table guarded enable row level security;
      create table forgotten (id serial primary key);
    `);
    await expect(db.tablesWithoutRls()).resolves.toEqual(["forgotten"]);
    await db.close();
  });
});
