import { describe, expect, it } from "vitest";
import * as schema from ".";
import { createSchemaTestDb } from "../testing/createSchemaTestDb";
import { ANAND } from "../testing/identities";

describe("schema-wide guarantees", () => {
  it("has row level security on every table", async () => {
    // Drizzle enables RLS on a table only when that table declares a policy,
    // so a new table with none is readable and writable by every authenticated
    // caller - and looks entirely ordinary in review. This assertion is what
    // makes that a failing suite rather than something someone must remember.
    const db = await createSchemaTestDb();
    await expect(db.tablesWithoutRls()).resolves.toEqual([]);
    await db.close();
  });

  it("gives an unauthenticated caller no access to anything", async () => {
    const db = await createSchemaTestDb();
    const tables = ["users", "devices", "blocks", "invitations", "link_codes"];
    for (const table of tables) {
      await expect(db.asAnon(`select * from ${table}`)).rejects.toThrow(/permission denied/i);
    }
    await db.close();
  });

  it("exposes every table the schema defines", async () => {
    // Guards the wiring rather than the security: a table file that is never
    // re-exported from schema/index.ts is absent from the generated DDL, so
    // its policies would go untested here AND unpushed to Supabase, while
    // every other test in this package still passes.
    const db = await createSchemaTestDb();
    const present = await db.asService(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`
    );
    expect(present.map((r) => r.tablename)).toEqual([
      "blocks",
      "devices",
      "invitations",
      "link_codes",
      "users",
    ]);
    await db.close();
  });

  it("denies by default: a user with no row sees nothing anywhere", async () => {
    const db = await createSchemaTestDb();
    await expect(db.asUser(ANAND, "select * from users")).resolves.toEqual([]);
    await expect(db.asUser(ANAND, "select * from invitations")).resolves.toEqual([]);
    await db.close();
  });

  it("pins the invitation status vocabulary", () => {
    // The mobile state machine in utils/invitationStatus.ts declares the same
    // eight values. It cannot be imported here - lib/ must not depend on
    // artifacts/ - so this only pins the database side, and the two-way check
    // belongs in the mobile package once it consumes @workspace/db.
    //
    // What it does buy: changing the enum forces an edit to this list, which
    // is the moment to go and change the client. Diverging silently is the
    // failure mode, and it surfaces as a constraint violation on the write
    // path in production.
    expect([...schema.invitationStatusEnum.enumValues].sort()).toEqual([
      "accepted",
      "blocked",
      "cancelled",
      "declined",
      "done",
      "expired",
      "invited",
      "rescheduled",
    ]);
  });
});
