import { wrapRlsTestDb, type RlsTestDb } from "./rlsHarness";
import { openFromSnapshot } from "./schemaSnapshot";

/**
 * A fresh in-process Postgres carrying the REAL schema - tables, policies, and
 * the column privileges RLS cannot express - with no network and no daemon.
 *
 * Every policy in this package is exercised through here rather than against a
 * hand-written fixture, so a test cannot keep passing against a schema that has
 * since changed underneath it.
 */
export async function createSchemaTestDb(): Promise<RlsTestDb> {
  return wrapRlsTestDb(await openFromSnapshot());
}
