# `/catchup` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/catchup` project skill that reconstructs project state after time away and ends with one backlog-grounded proposed next step.

**Architecture:** A single zero-dependency Node script (`transcript.js`) does the one thing a prompt cannot do safely — reduce a 14 MB session transcript to ~20 KB of signal. `SKILL.md` is the prompt that orchestrates git, `backlog.md`, the docs tree, and that script's output into a six-section briefing. The skill is read-only over the repo and writes exactly two gitignored files.

**Tech Stack:** Node 24 (`node:test` built-in runner — no new dependencies, which also respects the repo's `minimumReleaseAge` supply-chain rule), Git Bash, Claude Code skill format.

**Spec:** `docs/superpowers/specs/2026-08-14-catchup-skill-design.md`

## Global Constraints

- **Never read a transcript `.jsonl` directly into context.** Largest observed is 14,445,710 bytes. All transcript access goes through `transcript.js`.
- **No new npm dependencies.** `node:test` and `node:assert` only.
- **Read-only over the repo.** No commits, stash drops, deletions, or branch operations by the skill at runtime.
- **No build tooling at runtime.** No `pnpm typecheck`, no `jest`. Health comes from git alone.
- Transcript directory: `C:\Users\anand\.claude\projects\c--workspace-remindme\`
- Skill directory: `.claude/skills/catchup/`
- Written files (both gitignored): `.claude/catchup-state.md`, `.claude/last-catchup.md`
- `system_learnings.md` is **read-only** for this skill — never written by it.
- The Bash tool here is **Git Bash**, not PowerShell. Use `<<'EOF'` heredocs, never PowerShell `@'...'@` (see `system_learnings.md` 2026-08-09).

## Verified findings this plan depends on

These were confirmed empirically against the real transcript directory before writing this plan. Do not re-derive them:

1. **`jq` is unavailable** in this Git Bash environment; **Node v24.18.0 is available**.
2. **mtime cannot order sessions.** Four transcripts share mtime `Aug 5 11:17`. Concretely: `bc858073` has the *latest* mtime of that group (`2026-08-05T05:47:10.171Z`) but the *oldest* real activity (`2026-08-02T17:14:22.712Z`). Order by the last `timestamp` field found in file content instead.
3. **The final JSONL line is often untimestamped** (e.g. `{"type":"custom-title"}`), so `tail -1` is not sufficient — scan backwards for the last line that has a `timestamp`.
4. **`type:"user"` entries are mostly not human turns.** They include `tool_result` blocks, `isMeta` skill/caveat injections, and IDE context tags. All must be filtered.
5. **The final assistant text block is high-value and cheap** (827–1861 chars observed) and routinely contains an explicit "Next:" / "Remaining:" statement. This is the only reliable signal for "did the session end clean or mid-task", so the plan captures it — a deliberate, documented refinement of the spec's "assistant prose discarded" rule, which Task 5 writes back into the spec.
6. Extraction ratio achieved on the 14 MB file: **19,523 chars out (~740:1)**.

## File Structure

| File | Responsibility |
|---|---|
| `.claude/skills/catchup/transcript.js` | Select the newest prior session and reduce it to signal. Two pure functions + a CLI. |
| `.claude/skills/catchup/transcript.test.js` | Tests for both functions against synthetic fixtures. |
| `.claude/skills/catchup/SKILL.md` | The prompt: orchestration, section order, judgment rules, write targets. |
| `.gitignore` | Add the two runtime-written files. |
| `docs/superpowers/specs/2026-08-14-catchup-skill-design.md` | Amend for finding #5. |

---

### Task 1: Session selection by content timestamp

**Files:**
- Create: `.claude/skills/catchup/transcript.js`
- Test: `.claude/skills/catchup/transcript.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `lastActivityTs(filePath) -> string|null` (ISO timestamp) and `selectSession(dir, excludePrefix) -> {file, ts}|null`. Task 2 adds `extract()` to the same module; Task 3's `SKILL.md` calls the CLI.

- [ ] **Step 1: Write the failing test**

Create `.claude/skills/catchup/transcript.test.js`:

```js
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
  // "old" is written LAST so it has the newest mtime, but the oldest content ts.
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test .claude/skills/catchup/transcript.test.js`
Expected: FAIL — `Cannot find module './transcript.js'`

- [ ] **Step 3: Write the minimal implementation**

Create `.claude/skills/catchup/transcript.js`:

```js
"use strict";
const fs = require("fs");
const path = require("path");

const TAIL_BYTES = 65536;

/**
 * Last `timestamp` field in the file, scanning backwards.
 * Reads only the trailing TAIL_BYTES so this stays fast on 14 MB transcripts.
 * The final JSONL line is frequently untimestamped (e.g. {"type":"custom-title"}),
 * so tail -1 is not sufficient.
 */
function lastActivityTs(filePath) {
  const fd = fs.openSync(filePath, "r");
  let buf, len;
  try {
    const size = fs.fstatSync(fd).size;
    len = Math.min(size, TAIL_BYTES);
    buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buf.toString("utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (o.timestamp) return o.timestamp;
    } catch {
      /* partial first line from the byte-window cut, or malformed: skip */
    }
  }
  return null;
}

/**
 * Newest prior session in `dir`, ordered by content timestamp.
 * mtime is NOT usable here: transcripts in this project have been bulk-touched,
 * leaving four files sharing one mtime while their real activity spans days.
 */
function selectSession(dir, excludePrefix) {
  if (!fs.existsSync(dir)) return null;
  const cands = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .filter((f) => !excludePrefix || !f.startsWith(excludePrefix))
    .map((f) => ({ file: f, ts: lastActivityTs(path.join(dir, f)) }))
    .filter((c) => c.ts)
    .sort((a, b) => b.ts.localeCompare(a.ts));
  return cands.length ? cands[0] : null;
}

module.exports = { lastActivityTs, selectSession };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test .claude/skills/catchup/transcript.test.js`
Expected: PASS, 5/5.

- [ ] **Step 5: Verify against the real directory**

Run:
```bash
node -e 'const{selectSession}=require("./.claude/skills/catchup/transcript.js");console.log(selectSession("C:/Users/anand/.claude/projects/c--workspace-remindme",null));'
```
Expected: prints `4dace283-…` (or a newer session if more have run since). It must NOT print `bc858073-…`, which is the mtime-trap file.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/catchup/transcript.js .claude/skills/catchup/transcript.test.js
git commit -F - <<'EOF'
feat(catchup): select the newest prior session by content timestamp

mtime cannot order these transcripts - four share one bulk-touched
mtime, and the file with the newest mtime has the oldest real activity.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Transcript extraction

**Files:**
- Modify: `.claude/skills/catchup/transcript.js` (add `extract` + CLI)
- Modify: `.claude/skills/catchup/transcript.test.js` (append tests)

**Interfaces:**
- Consumes: `selectSession`, `lastActivityTs` from Task 1.
- Produces: `extract(filePath, tailN) -> { sessionId, cwd, lastTs, humanTurns: [{ts,text}], editedFiles: [[path,count]], finalAssistantText: string }`, and a CLI entry point `node transcript.js <dir> [excludePrefix]` printing a plain-text report. Task 3's `SKILL.md` calls only the CLI.

- [ ] **Step 1: Write the failing tests**

Append to `.claude/skills/catchup/transcript.test.js`:

```js
const { extract } = require("./transcript.js");

test("extract keeps human turns and drops tool_result, isMeta and sidechain", () => {
  const d = tmpdir();
  const p = writeJsonl(d, "s.jsonl", [
    { type: "user", timestamp: "2026-08-01T10:00:00.000Z", sessionId: "s1", cwd: "C:\\repo",
      message: { content: "work on dark mode" } },
    { type: "user", timestamp: "2026-08-01T10:01:00.000Z", isMeta: true,
      message: { content: "Base directory for this skill: C:\\x" } },
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test .claude/skills/catchup/transcript.test.js`
Expected: FAIL — `extract is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `.claude/skills/catchup/transcript.js`, above `module.exports`:

```js
// Wrapper tags Claude Code injects into user turns that are not human intent.
const STRIP_TAGS =
  /<(local-command-caveat|command-name|command-message|command-args|local-command-stdout|ide_opened_file|ide_selection|system-reminder)>[\s\S]*?<\/\1>/g;

const EDIT_TOOLS = /^(Edit|Write|NotebookEdit)$/;

/**
 * Reduce one transcript to signal. On the largest observed file this turns
 * 14,445,710 bytes into ~19.5 KB.
 *
 * Deliberately kept: human turns (intent), edited file paths (where), and the
 * FINAL assistant text block - the latter is the only reliable indicator of
 * whether the session ended cleanly, and routinely states "Next: ...".
 * Deliberately dropped: all tool results and all non-final assistant prose.
 */
function extract(filePath, tailN) {
  const humanTurns = [];
  const edited = new Map();
  let sessionId = null, cwd = null, lastTs = null, finalAssistantText = "";

  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }

    if (o.timestamp) lastTs = o.timestamp;
    if (o.sessionId) sessionId = o.sessionId;
    if (o.cwd) cwd = o.cwd;
    if (o.isSidechain) continue;

    if (o.type === "user" && !o.isMeta) {
      const c = o.message && o.message.content;
      let text = "";
      if (typeof c === "string") text = c;
      else if (Array.isArray(c))
        text = c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      text = text.replace(STRIP_TAGS, "").trim();
      if (text) humanTurns.push({ ts: o.timestamp, text });
    }

    if (o.type === "assistant") {
      const c = o.message && o.message.content;
      if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b.type === "tool_use" && EDIT_TOOLS.test(b.name)) {
          const fp = b.input && b.input.file_path;
          if (fp) edited.set(fp, (edited.get(fp) || 0) + 1);
        }
      }
      const t = c.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (t) finalAssistantText = t;
    }
  }

  return {
    sessionId, cwd, lastTs, humanTurns,
    editedFiles: [...edited].sort((a, b) => b[1] - a[1]),
    finalAssistantText,
    tailN,
  };
}
```

Replace the existing `module.exports` line with:

```js
module.exports = { lastActivityTs, selectSession, extract };

if (require.main === module) {
  const dir = process.argv[2];
  const excludePrefix = process.argv[3] || null;
  if (!dir) {
    console.error("usage: node transcript.js <transcript-dir> [excludeSessionPrefix]");
    process.exit(2);
  }
  const picked = selectSession(dir, excludePrefix);
  if (!picked) {
    console.log("NO_PRIOR_SESSION");
    process.exit(0);
  }
  const r = extract(path.join(dir, picked.file), 10);
  console.log(`SESSION: ${r.sessionId}`);
  console.log(`FILE: ${picked.file}`);
  console.log(`CWD: ${r.cwd}`);
  console.log(`LAST_ACTIVITY: ${r.lastTs}`);
  console.log(`HUMAN_TURNS: ${r.humanTurns.length}`);

  console.log(`\n=== FILES EDITED (${r.editedFiles.length}) ===`);
  for (const [f, n] of r.editedFiles.slice(0, 30)) console.log(`  ${n}x ${f}`);

  console.log(`\n=== ALL HUMAN TURNS (each truncated to 300 chars) ===`);
  for (const h of r.humanTurns)
    console.log(`[${h.ts}] ${h.text.slice(0, 300).replace(/\n+/g, " / ")}`);

  console.log(`\n=== FINAL ${r.tailN} TURNS (full) ===`);
  for (const h of r.humanTurns.slice(-r.tailN)) console.log(`[${h.ts}] ${h.text}\n---`);

  console.log(`\n=== FINAL ASSISTANT MESSAGE (last 2000 chars) ===`);
  console.log(r.finalAssistantText.slice(-2000) || "(none)");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test .claude/skills/catchup/transcript.test.js`
Expected: PASS, 10/10.

- [ ] **Step 5: Verify the size reduction against the real 14 MB transcript**

Run:
```bash
node .claude/skills/catchup/transcript.js "C:/Users/anand/.claude/projects/c--workspace-remindme" | wc -c
```
Expected: on the order of 20,000 chars — **must be under 60,000**. If it exceeds that, lower the per-turn truncation from 300 chars before continuing; do not let the skill ship with an output that can flood context.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/catchup/transcript.js .claude/skills/catchup/transcript.test.js
git commit -F - <<'EOF'
feat(catchup): reduce a session transcript to human turns, edits and tail

Filters out tool_result blocks, isMeta injections, IDE tags and sidechain
turns - type:"user" is mostly not human intent. Keeps the final assistant
text block, which is where "Next: ..." lives. ~740:1 on the 14 MB file.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The skill prompt

**Files:**
- Create: `.claude/skills/catchup/SKILL.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the Task 2 CLI, `node .claude/skills/catchup/transcript.js <dir> [excludePrefix]`.
- Produces: the `/catchup` skill itself. No later task depends on its internals.

- [ ] **Step 1: Write `SKILL.md`**

Create `.claude/skills/catchup/SKILL.md`:

````markdown
---
name: catchup
description: Use when returning to this project after time away, or when asked "where was I", "what's the state of the project", or "catch me up" - reconstructs in-flight work, what landed, and open threads from git, backlog.md and the last session transcript, ending with one proposed next step.
---

# Catchup — project state after time away

Produce a briefing that makes re-reading `git status`, `backlog.md` and
`CLAUDE.md` by hand unnecessary, ending with **one** concrete proposed next step.

**Announce:** "Using catchup to reconstruct project state."

## Hard rules

- **Read-only over the repo.** Never commit, stash, drop a stash, delete, or
  switch branches. You write exactly two files, both gitignored.
- **Never read a `.jsonl` transcript directly.** They reach 14 MB. Transcript
  access goes only through `transcript.js`.
- **Never run build tooling.** No `pnpm typecheck`, no `jest`. Health comes
  from git alone. (The root typecheck has a known-broken `mockup-sandbox`
  failure that would be noise in every briefing — see `system_learnings.md`
  2026-08-07.)
- **Propose, do not execute.** Section 6 ends the run. Wait for approval.
- Do not write `system_learnings.md`. It is a read source here.

## Arguments

| Form | Window |
|---|---|
| *(none)* | Since `last_run` in `.claude/catchup-state.md` |
| `3 weeks`, `5 days` | That duration back from now |
| `since <sha>` | That commit forward |

## Step 1 — Derive the window first

The gap *is* the window: it decides how far back everything else is pulled.

1. An explicit argument wins outright.
2. Else read `.claude/catchup-state.md` for `last_run`.
3. Else (first run): window start = the **earlier** of the most recent commit's
   date minus 3 days, or 2 weeks ago. Say the window was inferred. A window
   starting *at* the last commit would be empty exactly when the absence was
   longest.

If an explicit sha is unknown to git, say so and fall back to rule 2 or 3.

## Step 2 — Gather

Run these. Do not skip any; each feeds a specific section.

```bash
git log --since="<WINDOW_START>" --format='%h %ad %s' --date=short
git status --porcelain
git stash list
git diff --stat
git log -1 --format='%h %ad %s' --date=short
```

Read `backlog.md` **in full** — it feeds both section 2 and section 6.

List `docs/superpowers/plans/`, `docs/superpowers/specs/`, `handoffs/` and
cross-check against `git status --porcelain` for untracked entries.

Extract the last session (the `--exclude` argument is this session's own id,
so it is never selected):

```bash
node .claude/skills/catchup/transcript.js \
  "C:/Users/anand/.claude/projects/c--workspace-remindme" "<CURRENT_SESSION_ID_PREFIX>"
```

If it prints `NO_PRIOR_SESSION`, say "no prior session found" and continue with
git + docs. If the current session id is unknown, pass no exclude argument and
instead discard any returned session whose `LAST_ACTIVITY` is within the last
few minutes — that is this session.

For the ledger gap, check which windowed commits touched `system_learnings.md`:

```bash
git log --since="<WINDOW_START>" --format='%h %s' --name-only -- system_learnings.md
```

## Step 3 — Write the briefing

Six sections, in this order. Weight section 3 most heavily.

**1. Gap.** Two lines. `"Away 4 days. Last commit Aug 10, last catchup Aug 6.
Pulling everything since Aug 6."` State the window and how it was derived.

**2. What this project is.** 3–5 lines from `CLAUDE.md` + `backlog.md`. Nearly
stable across runs. It exists so a long absence does not require re-reading
`CLAUDE.md` before the rest makes sense.

**3. Where you left off.**
- Uncommitted and untracked files, grouped by area.
- **All stashes, always — never window-filtered.** Stashes are standing state,
  not events. Give each a **judgment** on whether later commits appear to
  supersede it (compare the stash subject and date against what landed). Say
  "looks superseded by `<sha>`" or "still unique", never a bare list. You are
  not certain — phrase it as a read, not a verdict, and never propose dropping
  one without the user asking.
- Last session: its intent (from the human turns), the files it edited, and
  whether it ended clean or mid-task. The `FINAL ASSISTANT MESSAGE` block is
  the best signal — it often states "Next: …" explicitly.

**4. What landed.** Commits in the window grouped by theme, not a raw log.

**5. Open threads.**
- Plans/specs written but never committed. **Report the discrepancy; never
  infer implementation status from tracked-ness.** Precedent
  (`system_learnings.md` 2026-08-09): an uncommitted plan was partly
  implemented, and a committed screen did not match its plan.
- **Ledger gap:** windowed commits that did not touch `system_learnings.md`.
  Note that docs-only and trivial commits are legitimately exempt (the `Stop`
  hook's own escape clause), so this reads as "worth checking", not a nag.
- Anything the last session raised and left unresolved.

**6. Proposed next step.** Exactly one action, justified against **both** the
backlog and the in-flight state. It must cite a specific backlog item or a
specific piece of in-flight work — never a generic suggestion. Respect the
backlog's structure: `P1` is an explicit priority item; numbered items carry
inline `[FIXED <date>]` / `[IN PROGRESS]` markers; the `D1`–`D7`
device-verification section gates several others (notably `D1` gates the real
scope of item 1). Present it and stop.

If nothing changed in the window, say so in two lines. Do not pad six sections.

## Step 4 — Write state

Write `.claude/catchup-state.md`:

```markdown
last_run: <ISO timestamp>
head: <sha from git rev-parse HEAD>
in_flight: <one line on what was in flight at this run>
```

Write the full briefing verbatim to `.claude/last-catchup.md`.

Both are gitignored. Do not `git add` either.
````

- [ ] **Step 2: Add the runtime files to `.gitignore`**

Append to `.gitignore`:

```
# catchup skill — local session state, not committed
.claude/catchup-state.md
.claude/last-catchup.md
```

- [ ] **Step 3: Verify the ignore rules actually match**

Run:
```bash
touch .claude/catchup-state.md .claude/last-catchup.md
git status --porcelain .claude/
```
Expected: neither file appears. Then `rm .claude/catchup-state.md .claude/last-catchup.md`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/catchup/SKILL.md .gitignore
git commit -F - <<'EOF'
feat(catchup): add the /catchup skill prompt

Six-section briefing weighted to in-flight work, ending in one
backlog-grounded proposed next step. Read-only over the repo; the two
runtime files are gitignored as local session state.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: End-to-end verification

**Files:** none created; this task validates Tasks 1–3 against the real repo.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified working skill. Nothing depends on this task.

- [ ] **Step 1: Run the full test suite**

Run: `node --test .claude/skills/catchup/transcript.test.js`
Expected: PASS, 10/10.

- [ ] **Step 2: Capture the repo state before the run**

Run: `git status --porcelain > /tmp/catchup-before.txt && git rev-parse HEAD`

- [ ] **Step 3: Invoke the skill**

Invoke `/catchup` in a session and read the briefing it produces.

Check each against the spec's success criteria:
- Section 1 states a gap and the derived window.
- Section 2 describes the project in 3–5 lines.
- Section 3 lists the untracked files and gives **all three** stashes a
  supersession judgment.
- Section 5 flags the untracked `docs/superpowers/plans/2026-08-03-mockup-2a-restyle.md`
  **without asserting it is unimplemented** — the known trap.
- Section 6 cites a specific backlog item (`P1`, `D1`, `M4 Tier 1`, or similar).

- [ ] **Step 4: Verify the repo was not mutated**

Run:
```bash
git status --porcelain > /tmp/catchup-after.txt
diff /tmp/catchup-before.txt /tmp/catchup-after.txt && echo "CLEAN"
git stash list
```
Expected: `CLEAN`, and the stash list is unchanged at 3 entries. The two written
files must not appear in `git status` — they are gitignored.

- [ ] **Step 5: Verify the state file round-trips**

Run: `cat .claude/catchup-state.md`
Expected: a `last_run`, a `head` matching `git rev-parse HEAD`, and a one-line
`in_flight`. Then invoke `/catchup` a second time and confirm section 1 now
reports a near-zero gap derived from that checkpoint rather than the first-run
fallback.

- [ ] **Step 6: Commit any fixes found**

If steps 3–5 exposed defects, fix them, re-run the tests, and commit:

```bash
git add -A .claude/skills/catchup/
git commit -F - <<'EOF'
fix(catchup): corrections from end-to-end verification

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Reconcile the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-catchup-skill-design.md`

**Interfaces:**
- Consumes: the verified behaviour from Task 4.
- Produces: a spec matching what was built.

- [ ] **Step 1: Amend the transcript section**

In the "Transcript handling" section, the spec currently says assistant prose is
discarded wholesale. Replace that sentence with:

```markdown
Assistant prose and all tool results are discarded, with one exception: the
**final** assistant text block is kept (truncated to 2,000 chars). Verified
during implementation — it is 800–1,900 chars in practice and routinely states
"Next: …" outright, making it the only reliable signal for whether the session
ended cleanly, which section 3 requires. Everything else is verbose and
re-derivable from the commits.
```

Add a fourth extraction to the numbered list:

```markdown
4. **The final assistant text block** — truncated; the "did it end clean" signal.
```

- [ ] **Step 2: Record the measured reduction**

In the same section, after the 14 MB sentence, add:

```markdown
Measured on that file: 14,445,710 bytes in, 19,523 chars out (~740:1).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-14-catchup-skill-design.md
git commit -F - <<'EOF'
docs: reconcile the catchup spec with what was built

Keeps the final assistant text block - it is where "Next: ..." lives and
is the only reliable end-clean-or-mid-task signal. Records the measured
740:1 reduction.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: Add a `system_learnings.md` entry**

The mtime trap is already logged (2026-08-14). Add one entry only if Task 4
surfaced something non-obvious that is not already recorded — e.g. a filtering
rule that silently dropped real content. If nothing did, skip it and say so;
the `Stop` hook's escape clause covers docs-and-skill-only work.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Invocation + argument forms | 3 (Arguments table) |
| Window derivation, first-run fallback | 3 (Step 1) |
| All six sources | 3 (Step 2) |
| Transcript: never read directly, extractive, last session only | 1, 2 |
| Newest-by-content-timestamp, exclude current session | 1 |
| Six output sections in order | 3 (Step 3) |
| All stashes, unwindowed, with judgment | 3 (§3) |
| Ledger gap with docs-exempt caveat | 3 (§5) |
| Backlog-grounded single proposal | 3 (§6) |
| Two gitignored write targets | 3 (Steps 1–3) |
| `system_learnings.md` read-only | 3 (Hard rules) |
| No health checks / no triage / no mutation | 3 (Hard rules), verified in 4 |
| All five failure modes | 3 (Steps 1–2), CLI `NO_PRIOR_SESSION` in 2 |
| Success criteria 1–4 | 4 (Steps 3–5) |

No gaps.

**Placeholder scan:** none. Every code step carries complete runnable content.

**Type consistency:** `lastActivityTs`, `selectSession`, `extract` are used with
identical names and signatures in Tasks 1–3. `selectSession` returns
`{file, ts}`; the CLI uses `picked.file`. `extract` returns `editedFiles` as
sorted `[path, count]` pairs, matching both the test assertion and the CLI's
destructuring. The CLI flag order (`<dir> [excludePrefix]`) matches `SKILL.md`'s
invocation.
