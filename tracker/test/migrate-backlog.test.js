const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../db.js');
const {
  parseBacklog,
  parseUnscopedTable,
  extractMajorFeatureSections,
  stripDanglingAnchors,
  migrate,
  KIND_OVERRIDES,
} = require('../scripts/migrate-backlog.js');

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
| B9999 | 3 | Some totally new bug title | S | \`OPEN\` | scoping only |
| M9 | — | Smart re-nudge | L | \`OPEN\` | ready to spec |
`;
  const rows = parseBacklog(md);
  assert.strictEqual(rows[0].kindGuess, 'bug');
  assert.strictEqual(rows[1].kindGuess, 'feature');
});

test('parseBacklog applies KIND_OVERRIDES for known-misclassified titles', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B1 | 3 | Calendar integration | S | \`OPEN\` | scoping only |
| B5 | 18 | Rename \`SNOOZE_ACTION_ID\` tech debt | M | \`OPEN\` | needs a migration story |
`;
  const rows = parseBacklog(md);
  assert.strictEqual(rows[0].kindGuess, 'feature');
  assert.strictEqual(rows[1].kindGuess, 'debt');
  assert.strictEqual(KIND_OVERRIDES['Calendar integration'], 'feature');
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

test('parseUnscopedTable extracts the 3-column Legacy#/Item/Notes table', () => {
  const md = `
## Unscoped / needs a decision before it's an item

| Legacy # | Item | Notes |
| --- | --- | --- |
| 7 | Better app icon | Related packaging work. |
| 13 | Longer-text UX | Needs a brainstorm. |

## Major features

Not part of the unscoped table.
`;
  const rows = parseUnscopedTable(md);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].title, 'Better app icon');
  assert.strictEqual(rows[0].notesMd, 'Related packaging work.');
  assert.strictEqual(rows[0].legacyRef, 'legacy 7');
});

test('extractMajorFeatureSections pulls each ### M<n> essay verbatim', () => {
  const md = `
## Major features

### M2. Recurring reminders

Some prose about recurring reminders.
Second line.

### M3. Location-based reminders

Different prose here.

## Next section
`;
  const sections = extractMajorFeatureSections(md);
  assert.ok(sections.M2.includes('Some prose about recurring reminders.'));
  assert.ok(sections.M2.includes('Second line.'));
  assert.ok(!sections.M2.includes('Different prose here.'));
  assert.ok(sections.M3.includes('Different prose here.'));
});

test('stripDanglingAnchors removes self-referential anchor sentences', () => {
  const notes = 'See [Major features](#major-features) below — highest-value missing feature.';
  const stripped = stripDanglingAnchors(notes);
  assert.ok(!stripped.includes('#major-features'));
});

test('stripDanglingAnchors preserves real trailing content after the anchor fragment', () => {
  const notes = 'See [Major features](#major-features) below — highest-value missing feature, needs its own spec.';
  const stripped = stripDanglingAnchors(notes);
  assert.strictEqual(stripped, 'highest-value missing feature, needs its own spec.');
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
  const { itemCount } = migrate(db, md);

  const blockedItem = db.prepare("SELECT * FROM items WHERE id LIKE 'BUG-%' LIMIT 1").get();
  const deferredItem = db.prepare("SELECT * FROM items WHERE id LIKE 'FEAT-%' LIMIT 1").get();

  assert.strictEqual(itemCount, 2);
  assert.strictEqual(blockedItem.status, 'blocked');
  assert.strictEqual(deferredItem.status, 'deferred');

  db.close();
  fs.rmSync(dbPath, { force: true });
});

test('migrate folds a matching Major-features essay into that item notes_md', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| M2 | — | Recurring reminders | L | \`OPEN\` | See major features below. |

## Major features

### M2. Recurring reminders

Known constraints (2026-08-07 analysis): chrono-node does not return recurrence info.
`;
  const dbPath = path.join(__dirname, '../test-migrate-fold.db');
  try { fs.rmSync(dbPath, { force: true }); } catch {}

  const db = openDb(dbPath);
  migrate(db, md);
  const item = db.prepare("SELECT * FROM items WHERE id = 'FEAT-1'").get();
  assert.ok(item.notes_md.includes('chrono-node does not return recurrence info'));

  db.close();
  fs.rmSync(dbPath, { force: true });
});

test('migrate creates an M5 item from prose-only section with no table row', () => {
  const md = `
## Major features

### M5. Forward-to-remind

Create a reminder by forwarding/sharing from WhatsApp. **IN PROGRESS.**
`;
  const dbPath = path.join(__dirname, '../test-migrate-m5.db');
  try { fs.rmSync(dbPath, { force: true }); } catch {}

  const db = openDb(dbPath);
  migrate(db, md);
  const item = db.prepare("SELECT * FROM items WHERE title = 'Forward-to-remind'").get();
  assert.ok(item, 'expected an item titled Forward-to-remind to be created');
  assert.strictEqual(item.status, 'in_progress');
  assert.strictEqual(item.kind, 'feature');
  assert.ok(item.notes_md.includes('Create a reminder by forwarding'));

  db.close();
  fs.rmSync(dbPath, { force: true });
});

test('migrate creates items from the Unscoped table', () => {
  const md = `
## Unscoped / needs a decision before it's an item

| Legacy # | Item | Notes |
| --- | --- | --- |
| 7 | Better app icon | Related packaging work. |
`;
  const dbPath = path.join(__dirname, '../test-migrate-unscoped.db');
  try { fs.rmSync(dbPath, { force: true }); } catch {}

  const db = openDb(dbPath);
  migrate(db, md);
  const item = db.prepare("SELECT * FROM items WHERE title = 'Better app icon'").get();
  assert.ok(item, 'expected an item titled Better app icon to be created');
  assert.strictEqual(item.kind, 'debt');

  db.close();
  fs.rmSync(dbPath, { force: true });
});

test('migrate creates blocks rows for the known unambiguous dependency pairs', () => {
  const md = `
| # | Legacy # | Item | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| B7 | 2 | Ship next native build with current audio-transcription fixes | S | \`BLOCKED\` | test |
| B8 | — | M4 Tier 1 device sign-off | M | \`BLOCKED\` | test |
`;
  const dbPath = path.join(__dirname, '../test-migrate-blocks.db');
  try { fs.rmSync(dbPath, { force: true }); } catch {}

  const db = openDb(dbPath);
  const { blocksCreated } = migrate(db, md);
  assert.strictEqual(blocksCreated, 1);

  const blocker = db.prepare("SELECT id FROM items WHERE title LIKE 'Ship next native build%'").get();
  const blocked = db.prepare("SELECT id FROM items WHERE title = 'M4 Tier 1 device sign-off'").get();
  const link = db.prepare('SELECT * FROM blocks WHERE item_id = ? AND blocked_by_id = ?')
    .get(blocked.id, blocker.id);
  assert.ok(link, 'expected a blocks row linking device sign-off to the native build item');

  db.close();
  fs.rmSync(dbPath, { force: true });
});
