import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

/**
 * Render a Drizzle schema as the DDL `drizzle-kit push` would apply.
 *
 * This exists so RLS tests run against the SAME definition that reaches
 * Postgres. A hand-written DDL fixture in the test file would be a second
 * source of truth, and the failure mode is the worst kind: the day someone
 * adds a column or loosens a policy in the schema and forgets the fixture,
 * every test still passes while production enforces something else.
 */
export async function schemaDdl(schema: Record<string, unknown>): Promise<string> {
  const empty = generateDrizzleJson({});
  const target = generateDrizzleJson(schema);
  const statements = await generateMigration(empty, target);
  return statements.join("\n");
}
