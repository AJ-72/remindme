const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { lastActivityTs, selectSession } = require("./transcript.js");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "catchup-"));
}
function writeJsonl(dir, name, objs) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, objs.map((o) => JSON.stringify(o)).join("\n") + "\n");
  return p;
}

test("lastActivityTs ignores a trailing untimestamped line", () => {
  const d = tmpdir();
  const p = writeJsonl(d, "a.jsonl", [
    { type: "user", timestamp: "2026-08-01T10:00:00.000Z" },
    { type: "assistant", timestamp: "2026-08-01T11:00:00.000Z" },
    { type: "custom-title", customTitle: "no timestamp here" },
  ]);
  assert.equal(lastActivityTs(p), "2026-08-01T11:00:00.000Z");
});

test("lastActivityTs returns null when no line has a timestamp", () => {
  const d = tmpdir();
  const p = writeJsonl(d, "a.jsonl", [{ type: "custom-title" }]);
  assert.equal(lastActivityTs(p), null);
});

test("selectSession orders by content timestamp, not mtime", () => {
  const d = tmpdir();
  // "older" is given the NEWEST mtime but the OLDEST content timestamp.
  const newer = writeJsonl(d, "newer.jsonl", [
    { type: "user", timestamp: "2026-08-10T15:00:00.000Z" },
  ]);
  const older = writeJsonl(d, "older.jsonl", [
    { type: "user", timestamp: "2026-08-02T17:00:00.000Z" },
  ]);
  const future = new Date(Date.now() + 60000);
  fs.utimesSync(older, future, future);
  assert.ok(fs.statSync(older).mtimeMs > fs.statSync(newer).mtimeMs);
  assert.equal(selectSession(d, null).file, "newer.jsonl");
});

test("selectSession excludes the current session by prefix", () => {
  const d = tmpdir();
  writeJsonl(d, "aaaa1111.jsonl", [
    { type: "user", timestamp: "2026-08-10T15:00:00.000Z" },
  ]);
  writeJsonl(d, "bbbb2222.jsonl", [
    { type: "user", timestamp: "2026-08-09T15:00:00.000Z" },
  ]);
  assert.equal(selectSession(d, "aaaa1111").file, "bbbb2222.jsonl");
});

test("selectSession returns null on an empty directory", () => {
  assert.equal(selectSession(tmpdir(), null), null);
});
