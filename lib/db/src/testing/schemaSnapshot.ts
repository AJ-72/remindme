import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "../schema";
import { COLUMN_PRIVILEGES } from "../schema/privileges";
import { prepare } from "./rlsHarness";
import { schemaDdl } from "./schemaDdl";

/**
 * A prepared data directory, dumped once and reloaded per test.
 *
 * Booting PGlite and running initdb costs ~2.5s; loading a dumped data
 * directory costs ~0.6s. Every test still gets its OWN database, so isolation
 * is unchanged - this only skips re-running initdb and the DDL forty times.
 *
 * That matters more than a build-time number: a security suite slow enough to
 * be irritating is a security suite that stops being run before a commit.
 *
 * The cache cannot go stale: globalSetup rebuilds it at the start of every
 * run, including a run of one file.
 */
const SNAPSHOT_PATH = new URL(
  "../../node_modules/.cache/schema-snapshot.tar",
  import.meta.url
);

export async function buildSnapshot(): Promise<Buffer> {
  const db = await prepare(await schemaDdl(schema));
  await db.exec(COLUMN_PRIVILEGES);
  const dump = await db.dumpDataDir("none");
  await db.close();
  return Buffer.from(await dump.arrayBuffer());
}

/** Build the snapshot and cache it on disk. Called once, from globalSetup. */
export async function writeSnapshot(): Promise<void> {
  const path = fileURLToPath(SNAPSHOT_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await buildSnapshot());
}

let cached: Buffer | null = null;

async function snapshot(): Promise<Buffer> {
  if (cached) return cached;
  try {
    cached = readFileSync(fileURLToPath(SNAPSHOT_PATH));
  } catch {
    // No cache: someone is running a single test file directly, without the
    // global setup. Build it in-process rather than failing - a helper that
    // only works under the full suite is a helper people route around.
    cached = await buildSnapshot();
  }
  return cached;
}

export async function openFromSnapshot(): Promise<PGlite> {
  const data = await snapshot();
  return new PGlite({
    loadDataDir: new File([new Uint8Array(data)], "schema-snapshot.tar"),
  });
}
