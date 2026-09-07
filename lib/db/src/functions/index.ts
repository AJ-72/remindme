import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

interface Manifest {
  functions: string[];
}

/**
 * The ordered list of function files, from `manifest.json`.
 *
 * A manifest rather than a directory glob because `create function` resolves
 * plpgsql bodies at creation time, so order matters as soon as one function
 * calls another. A plain JSON file rather than this module's own array
 * because the deploy script is a `.mjs` that cannot import TypeScript, and
 * two hand-maintained lists would drift - with the tests exercising one and
 * production running the other.
 */
export const FUNCTION_FILES: string[] = (
  JSON.parse(readFileSync(here("./manifest.json"), "utf8")) as Manifest
).functions;

/** Every server function's SQL, in manifest order. */
export const SERVER_FUNCTIONS = FUNCTION_FILES.map((file) =>
  readFileSync(here(`./${file}`), "utf8")
).join("\n\n");
