const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { lastActivityTs, selectSession, extract } = require("./transcript.js");

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

test("extract keeps human turns and drops tool_result, isMeta and sidechain", () => {
  const d = tmpdir();
  const p = writeJsonl(d, "s.jsonl", [
    { type: "user", timestamp: "2026-08-01T10:00:00.000Z", sessionId: "s1", cwd: "C:/repo",
      message: { content: "work on dark mode" } },
    { type: "user", timestamp: "2026-08-01T10:01:00.000Z", isMeta: true,
      message: { content: "Base directory for this skill: C:/x" } },
    { type: "user", timestamp: "2026-08-01T10:02:00.000Z",
      message: { content: [{ type: "tool_result", content: "huge output" }] } },
    { type: "user", timestamp: "2026-08-01T10:03:00.000Z", isSidechain: true,
      message: { content: "subagent chatter" } },
  ]);
  const r = extract(p, 10);
  assert.equal(r.humanTurns.length, 1);
  assert.equal(r.humanTurns[0].text, "work on dark mode");
  assert.equal(r.sessionId, "s1");
});

test("extract strips IDE and slash-command wrapper tags", () => {
  const d = tmpdir();
  const p = writeJsonl(d, "s.jsonl", [
    { type: "user", timestamp: "2026-08-01T10:00:00.000Z",
      message: { content: "<ide_selection>noise</ide_selection>real request" } },
    { type: "user", timestamp: "2026-08-01T10:01:00.000Z",
      message: { content: "<command-name>/model</command-name>" } },
  ]);
  const r = extract(p, 10);
  assert.equal(r.humanTurns.length, 1);
  assert.equal(r.humanTurns[0].text, "real request");
});

test("extract collects Edit/Write paths with counts, ignoring reads", () => {
  const d = tmpdir();
  const p = writeJsonl(d, "s.jsonl", [
    { type: "assistant", timestamp: "2026-08-01T10:00:00.000Z", message: { content: [
      { type: "tool_use", name: "Edit", input: { file_path: "a.ts" } },
      { type: "tool_use", name: "Edit", input: { file_path: "a.ts" } },
      { type: "tool_use", name: "Write", input: { file_path: "b.ts" } },
      { type: "tool_use", name: "Read", input: { file_path: "c.ts" } },
    ] } },
  ]);
  const r = extract(p, 10);
  assert.deepEqual(r.editedFiles, [["a.ts", 2], ["b.ts", 1]]);
});

test("extract captures the LAST assistant text block only", () => {
  const d = tmpdir();
  const p = writeJsonl(d, "s.jsonl", [
    { type: "assistant", timestamp: "2026-08-01T10:00:00.000Z",
      message: { content: [{ type: "text", text: "early prose" }] } },
    { type: "assistant", timestamp: "2026-08-01T10:05:00.000Z",
      message: { content: [{ type: "text", text: "Next: run D1 on device" }] } },
  ]);
  const r = extract(p, 10);
  assert.equal(r.finalAssistantText, "Next: run D1 on device");
});

test("extract survives malformed lines", () => {
  const d = tmpdir();
  const p = path.join(d, "s.jsonl");
  fs.writeFileSync(p, '{"broken\n{"type":"user","timestamp":"2026-08-01T10:00:00.000Z","message":{"content":"ok"}}\n');
  assert.equal(extract(p, 10).humanTurns.length, 1);
});
