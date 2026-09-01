import { writeSnapshot } from "./schemaSnapshot";

/**
 * Build the prepared schema once for the whole run, so each test worker loads
 * it from disk instead of running initdb again.
 */
export default async function setup() {
  await writeSnapshot();
}
