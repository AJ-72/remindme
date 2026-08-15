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

module.exports = { lastActivityTs, selectSession };
