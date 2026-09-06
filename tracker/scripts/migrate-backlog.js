const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../db.js');
const { createItem } = require('../queries.js');

const STATUS_MAP = {
  OPEN: 'open',
  'IN PROGRESS': 'in_progress',
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
  DONE: 'done',
};

function guessKind(id) {
  if (id.startsWith('B')) return 'bug';
  if (id.startsWith('M')) return 'feature';
  return 'debt';
}

function splitTableRow(line) {
  return line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
}

function parseBacklog(markdownText) {
  const lines = markdownText.split('\n');
  const rows = [];

  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = splitTableRow(line);
    if (cells.length < 6) continue;

    const [id, legacyNum, title, effort, statusRaw, notes] = cells;
    if (id === '#' || id.startsWith('---')) continue;
    if (!/^[A-Z]+\d+$/.test(id)) continue;

    const statusText = statusRaw.replace(/`/g, '').trim();
    const status = STATUS_MAP[statusText];
    if (!status) continue;

    rows.push({
      legacyRef: legacyNum && legacyNum !== '—' ? `${id} (legacy ${legacyNum})` : id,
      kindGuess: guessKind(id),
      title,
      effort: ['S', 'M', 'L'].includes(effort) ? effort : null,
      status,
      notesMd: notes || null,
    });
  }

  return rows;
}

function migrate(db, markdownText) {
  const rows = parseBacklog(markdownText);
  for (const row of rows) {
    const notesMd = row.notesMd
      ? `${row.notesMd}\n\n_Migrated from backlog.md, ${row.legacyRef}._`
      : `_Migrated from backlog.md, ${row.legacyRef}._`;
    createItem(db, {
      kind: row.kindGuess,
      title: row.title,
      effort: row.effort,
      notesMd,
    });
  }
  return rows.length;
}

if (require.main === module) {
  const backlogPath = path.join(__dirname, '../../backlog.md');
  const dbPath = path.join(__dirname, '../tracker.db');
  const markdownText = fs.readFileSync(backlogPath, 'utf8');
  const db = openDb(dbPath);
  const count = migrate(db, markdownText);
  console.log(`Migrated ${count} items from backlog.md into tracker.db`);
  db.close();
}

module.exports = { parseBacklog, migrate };
