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
  let buf;
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
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
