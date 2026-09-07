/**
 * Apply everything `drizzle-kit push` does not manage, to DATABASE_URL.
 *
 * push handles tables, indexes, constraints and policies. It does NOT handle
 * functions or grants — and both carry security properties here:
 *
 *   - `functions/claimInvitations.sql` is SECURITY DEFINER and bypasses RLS
 *     by design; it is the only way an unclaimed invitation can be reached.
 *   - `schema/privileges.sql` is what stops a client writing
 *     `users.phone_hash` and squatting a phone number.
 *
 * Without this step both would exist in the test suite and be absent in
 * production. That gap is the exact failure this package exists to prevent,
 * so it gets a command:
 *
 *   pnpm --filter @workspace/db run push
 *   pnpm --filter @workspace/db run push:sql
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL must be set to apply server SQL.");
}

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// Functions first, in manifest order: each carries its own EXECUTE grants,
// and privileges.sql touches only tables and sequences. The manifest is the
// same one the test harness reads, so what is tested is what is deployed.
const { functions } = JSON.parse(read("./functions/manifest.json"));
const sql = [
  ...functions.map((file) => read(`./functions/${file}`)),
  read("./schema/privileges.sql"),
].join("\n\n");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // One transaction: a half-applied set is worse than none, since the revokes
  // come first and would leave the app locked out of its own data.
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("Applied server functions and privileges.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
