/**
 * Apply `schema/privileges.sql` to the database in DATABASE_URL.
 *
 * `drizzle-kit push` manages tables, indexes, constraints and policies - not
 * grants. Without this step the rules in privileges.sql would be a file nobody
 * ran, and the protections that depend on them (most sharply: a client cannot
 * write users.phone_hash and squat a phone number) would hold in the test
 * suite and be absent in production. That gap is the exact failure this
 * package exists to make impossible, so it gets a command.
 *
 *   pnpm --filter @workspace/db run push
 *   pnpm --filter @workspace/db run push:privileges
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL must be set to apply privileges.");
}

const sql = readFileSync(
  fileURLToPath(new URL("./schema/privileges.sql", import.meta.url)),
  "utf8"
);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // One transaction: a half-applied privilege set is worse than none, since
  // the revokes come first and would leave the app locked out of its own data.
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("Applied table and column privileges.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
