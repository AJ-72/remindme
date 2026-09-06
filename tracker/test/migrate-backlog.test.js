const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../db.js');
const { parseBacklog, migrate } = require('../scripts/migrate-backlog.js');

test('parseBacklog extracts rows from a backlog table', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B2 | 4 | Verify the snooze flow | S | \`OPEN\` | See device-tests. |
| B5 | 18 | Rename tech debt | M | \`OPEN\` | Needs a migration story. |
`;
  const rows = parseBacklog(md);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].legacyRef, 'B2 (legacy 4)');
  assert.strictEqual(rows[0].title, 'Verify the snooze flow');
  assert.strictEqual(rows[0].effort, 'S');
  assert.strictEqual(rows[0].status, 'open');
  assert.strictEqual(rows[0].notesMd, 'See device-tests.');
});

test('parseBacklog maps status text to schema status values', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B3 | 1 | Google Drive backup | M | \`BLOCKED\` | pending D1 |
| M2 | — | Recurring reminders | L | \`OPEN\` | needs a spec |
| M7 | — | Group reminders | L | \`OPEN\` (needs spec) | with extra text |
`;
  const rows = parseBacklog(md);
  assert.strictEqual(rows[0].status, 'blocked');
  assert.strictEqual(rows[1].status, 'open');
  assert.strictEqual(rows[2].status, 'open');
});

test('parseBacklog guesses kind from the ID prefix', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B1 | 3 | Calendar integration | S | \`OPEN\` | scoping only |
| M9 | — | Smart re-nudge | L | \`OPEN\` | ready to spec |
`;
  const rows = parseBacklog(md);
  assert.strictEqual(rows[0].kindGuess, 'bug');
  assert.strictEqual(rows[1].kindGuess, 'feature');
});

test('parseBacklog captures hyphenated IDs like M4-T2', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| M4-T2 | — | Tier 2 feature | L | \`DEFERRED\` | postponed |
`;
  const rows = parseBacklog(md);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].legacyRef, 'M4-T2');
  assert.strictEqual(rows[0].kindGuess, 'feature');
  assert.strictEqual(rows[0].status, 'deferred');
});

test('migrate persists status correctly to the database', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B3 | 1 | Google Drive backup | M | \`BLOCKED\` | test |
| M8 | — | MCP server | L | \`DEFERRED\` | test |
`;
  const dbPath = path.join(__dirname, '../test-migrate-status.db');
  try {
    fs.rmSync(dbPath, { force: true });
  } catch {}

  const db = openDb(dbPath);
  const count = migrate(db, md);

  const blockedItem = db.prepare("SELECT * FROM items WHERE id LIKE 'BUG-%' LIMIT 1").get();
  const deferredItem = db.prepare("SELECT * FROM items WHERE id LIKE 'FEAT-%' LIMIT 1").get();

  assert.strictEqual(count, 2);
  assert.strictEqual(blockedItem.status, 'blocked');
  assert.strictEqual(deferredItem.status, 'deferred');

  db.close();
  fs.rmSync(dbPath, { force: true });
});
