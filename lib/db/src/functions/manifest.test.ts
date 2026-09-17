import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FUNCTION_FILES } from ".";

describe("function manifest", () => {
  it("lists every .sql file in this folder", () => {
    // An unlisted file is applied nowhere: not by the tests, not by the
    // deploy script. The function would simply not exist, and every test of
    // it would fail with "function does not exist" - which reads like a typo
    // rather than a missing deploy step. Worse in the other direction: a file
    // listed here but deleted breaks the deploy, not the suite.
    const onDisk = readdirSync(fileURLToPath(new URL(".", import.meta.url)))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect([...FUNCTION_FILES].sort()).toEqual(onDisk);
  });
});
