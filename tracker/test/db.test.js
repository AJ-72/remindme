const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { openDb } = require('../db.js');

test('openDb creates schema and seeds id_counters', () => {
  const tmpPath = `${__dirname}/tmp-db-test.db`;
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

  const db = openDb(tmpPath);
  const row = db.prepare('SELECT next_n FROM id_counters WHERE prefix = ?').get('BUG');
  assert.strictEqual(row.next_n, 1);

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  assert.deepStrictEqual(tables, ['blocks', 'id_counters', 'items'].sort());

  db.close();
  fs.unlinkSync(tmpPath);
});
