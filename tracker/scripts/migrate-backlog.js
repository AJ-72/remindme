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
    if (!/^[A-Z]+\d+(-[A-Z0-9]+)?$/.test(id)) continue;

    const statusText = statusRaw.replace(/`/g, '').trim().split(/\s+/)[0]; // Extract first word only
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
      status: row.status,
      notesMd,
    });
  }
  return rows.length;
}

function findOriginalBacklogContent(repoRoot) {
  const { execSync } = require('node:child_process');
  try {
    const log = execSync('git log --format=%H -- backlog.md', { cwd: repoRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(sha => sha.length > 0);

    for (const sha of log) {
      const content = execSync(`git show ${sha}:backlog.md`, { cwd: repoRoot, encoding: 'utf8' });
      if (!content.includes('Backlog moved')) {
        return content;
      }
    }

    throw new Error(
      'Could not find original backlog.md content in git history — all commits contain the pointer-file marker. ' +
      'The backlog content may have been permanently lost or never committed.'
    );
  } catch (err) {
    if (err.message.includes('Could not find original')) {
      throw err;
    }
    throw new Error(`Failed to search git history for backlog.md: ${err.message}`);
  }
}

if (require.main === module) {
  const backlogPath = path.join(__dirname, '../../backlog.md');
  const dbPath = path.join(__dirname, '../tracker.db');
  const repoRoot = path.join(__dirname, '../../');

  let markdownText;
  const fileContent = fs.readFileSync(backlogPath, 'utf8');

  // If backlog.md has been replaced with a pointer file, read from git history
  if (fileContent.includes('Backlog moved')) {
    try {
      markdownText = findOriginalBacklogContent(repoRoot);
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  } else {
    markdownText = fileContent;
  }

  const db = openDb(dbPath);
  const count = migrate(db, markdownText);
  console.log(`Migrated ${count} items from backlog.md into tracker.db`);
  db.close();
}

module.exports = { parseBacklog, migrate, findOriginalBacklogContent };
