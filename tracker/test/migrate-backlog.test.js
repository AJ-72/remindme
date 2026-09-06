const test = require('node:test');
const assert = require('node:assert');
const { parseBacklog } = require('../scripts/migrate-backlog.js');

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
`;
  const rows = parseBacklog(md);
  assert.strictEqual(rows[0].status, 'blocked');
  assert.strictEqual(rows[1].status, 'open');
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
