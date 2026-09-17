import { EVENTS } from "@/constants/analytics";

/**
 * Every declared event must have a real emitter.
 *
 * This guards the failure that makes a dashboard actively misleading rather
 * than merely incomplete: an event name that exists in the catalogue, renders
 * a chart, reads zero forever, and is believed. Four of these were genuinely
 * unwired for a while and were marked as such in the source; this test is what
 * replaces that marker now they are all connected.
 *
 * The node built-ins are reached through an untyped `require` and declared
 * inline on purpose: this package has no `@types/node`, deliberately (it is a
 * React Native app, and a stray `process`/`Buffer` compiling here would be a
 * runtime crash on device). One test needing to read the source tree is not a
 * reason to hand the whole package node's globals.
 */
declare const require: (module: string) => any;

const fs = require("fs") as {
  readdirSync: (p: string, o: { withFileTypes: true }) => {
    name: string;
    isDirectory: () => boolean;
  }[];
  readFileSync: (p: string, enc: string) => string;
  existsSync: (p: string) => boolean;
};

const SEARCH_ROOTS = ["app", "components", "services", "contexts", "utils"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// jest-expo runs with the package root as cwd, so these resolve relative to
// artifacts/mobile.
const ALL_SOURCE = SEARCH_ROOTS.flatMap((root) => sourceFiles(root))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

describe("the event catalogue", () => {
  it.each(Object.keys(EVENTS))("%s is emitted by at least one call site", (key) => {
    // Word-boundary anchored, so REMINDER_CREATED cannot be satisfied by a
    // hypothetical REMINDER_CREATED_V2.
    expect(new RegExp(`EVENTS\\.${key}\\b`).test(ALL_SOURCE)).toBe(true);
  });

  it("has no duplicate event names", () => {
    const names = Object.values(EVENTS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("names every event in lower snake case", () => {
    for (const name of Object.values(EVENTS)) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
