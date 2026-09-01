import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The table and column privileges, read from `privileges.sql`.
 *
 * The SQL lives in a real .sql file rather than a template literal so that one
 * text is the source for all three ways it gets applied: the schema tests, the
 * `push:privileges` script, and a human pasting it into the Supabase SQL
 * editor. A second copy anywhere would drift, and the drift would be silent -
 * the tests would keep passing while production granted something else.
 */
export const COLUMN_PRIVILEGES = readFileSync(
  fileURLToPath(new URL("./privileges.sql", import.meta.url)),
  "utf8"
);
