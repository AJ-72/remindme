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

// Hand-verified overrides for the one-time migration: `guessKind`'s naive
// "B* -> bug" heuristic misclassifies several real backlog.md rows (features
// and tech debt tagged as bugs). Keyed by the row's exact title text as it
// appears in backlog.md's Item column.
const KIND_OVERRIDES = {
  'Calendar integration': 'feature', // scoping-only question, folds into M5 feature work, not a defect
  'Google Drive backup / migration': 'feature', // new backup/sync capability, not a defect
  'Manglish support (regional language typed in English)': 'feature', // new capability
  'Rename `SNOOZE_ACTION_ID` tech debt': 'debt', // literally tagged "tech debt" in its own title
  'Image support in shared/dictated input': 'feature', // new capability, part of M5
  'Ship next native build with current audio-transcription fixes': 'debt', // release/process task, not a defect or new feature
  'M4 Tier 1 device sign-off': 'feature', // verification of a built feature, tracked as feature work per review guidance
};

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
      legacyId: id,
      legacyRef: legacyNum && legacyNum !== '—' ? `${id} (legacy ${legacyNum})` : id,
      kindGuess: KIND_OVERRIDES[title] || guessKind(id),
      title,
      effort: ['S', 'M', 'L'].includes(effort) ? effort : null,
      status,
      notesMd: notes || null,
    });
  }

  return rows;
}

// Parses the 3-column "## Unscoped / needs a decision before it's an item"
// table (Legacy #, Item, Notes — no ID/Effort/Status columns).
function parseUnscopedTable(markdownText) {
  const lines = markdownText.split('\n');
  const rows = [];
  let inSection = false;

  for (const line of lines) {
    if (/^##\s+Unscoped/i.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line.trim())) break; // next section ends this one
    if (!inSection) continue;

    if (!line.trim().startsWith('|')) continue;
    const cells = splitTableRow(line);
    if (cells.length < 3) continue;

    const [legacyNum, title, notes] = cells;
    if (legacyNum === 'Legacy #' || legacyNum.startsWith('---')) continue;

    rows.push({
      legacyRef: `legacy ${legacyNum}`,
      title,
      notesMd: notes || null,
    });
  }

  return rows;
}

// Extracts each "### M<n>. <title>" prose section (heading through the next
// "###" or "##" heading), keyed by M-number (e.g. "M2", "M4", "persona").
function extractMajorFeatureSections(markdownText) {
  const lines = markdownText.split('\n');
  const sections = {};
  let currentKey = null;
  let currentLines = [];

  function flush() {
    if (currentKey) {
      sections[currentKey] = currentLines.join('\n').trim();
    }
    currentLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(M(\d+))\.\s+(.+)$/);
    const personaMatch = line.match(/^###\s+(Persona-based personalization onboarding)/);
    const nextTopLevel = /^##\s+/.test(line) && !/^###/.test(line);

    if (headingMatch) {
      flush();
      currentKey = headingMatch[1]; // e.g. 'M2'
      currentLines = [line];
      continue;
    }
    if (personaMatch) {
      flush();
      currentKey = 'persona';
      currentLines = [line];
      continue;
    }
    if (nextTopLevel && currentKey) {
      flush();
      currentKey = null;
      continue;
    }
    if (currentKey) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

// Strips the bare "See [Major features](#major-features) below" /
// "[M5](#m5-forward-to-remind)"-style dangling anchor-link sentence
// fragments that pointed at the now-folded-in prose section. Leaves other
// prose (including links to device-tests/ or other real files) untouched.
function stripDanglingAnchors(notesMd) {
  if (!notesMd) return notesMd;
  return notesMd
    // "See [Major features](#major-features) below" fragment only — keeps
    // any trailing clause after the em-dash (real content, e.g. "— highest-
    // value missing feature, needs its own spec.") rather than eating the
    // whole sentence.
    .replace(/See \[Major features\]\(#major-features\) below\s*(—|-)?\s*/gi, '')
    // bare self-referential anchor links like [M5](#m5-forward-to-remind)
    .replace(/\[(M\d+(-T\d+)?)\]\(#m[\w-]+\)/gi, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[,.]\s*/, '')
    .trim();
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

// Explicit "blocks" relationships found by reading the real backlog.md text
// (see the code-review report for the reasoning behind each). Keyed by the
// *blocked* item's exact migrated title, pointing at the *blocker* item's
// exact migrated title. Resolved to real IDs after all items are created.
const BLOCKS_BY_TITLE = [
  {
    blockedTitle: 'M4 Tier 1 device sign-off',
    blockerTitle: 'Ship next native build with current audio-transcription fixes',
    reason: 'device sign-off needs a native build; the other item is exactly that build',
  },
  {
    blockedTitle: 'MCP server for the app',
    blockerTitle: 'Remind someone else, Tier 2 (app-to-app + acknowledgement)',
    reason: 'MCP notes: "Same prerequisite as M4 Tier 2 and M7 — sequence this after Tier 2"',
  },
  {
    blockedTitle: 'Group reminders with RSVP',
    blockerTitle: 'Remind someone else, Tier 2 (app-to-app + acknowledgement)',
    reason: 'notes: "Shares M4 Tier 2\'s backend"',
  },
  {
    blockedTitle: 'Remind a contact from natural language',
    blockerTitle: 'M4 Tier 1 device sign-off',
    reason: 'M6 builds on M4 Tier 1, which is built but pending device sign-off',
  },
];

function migrate(db, markdownText) {
  const rows = parseBacklog(markdownText);
  const unscopedRows = parseUnscopedTable(markdownText);
  const majorFeatureSections = extractMajorFeatureSections(markdownText);

  const createdByTitle = {};

  // 1. Create the Tier 0/1/2 table-row items.
  for (const row of rows) {
    const migratedNote = `_Migrated from backlog.md, ${row.legacyRef}._`;
    const baseNotes = row.notesMd ? stripDanglingAnchors(row.notesMd) : null;
    let notesMd = baseNotes ? `${baseNotes}\n\n${migratedNote}` : migratedNote;

    // Fold in the matching "### M<n>." prose essay, if this row references
    // one (e.g. an M2/M3/M4/M7/M8/M9 section folded into its own row, or a
    // B-row whose notes mention a major-feature section it belongs to).
    const mMatch = row.legacyId.match(/^M(\d+)/);
    if (mMatch && majorFeatureSections[`M${mMatch[1]}`]) {
      notesMd = `${notesMd}\n\n---\n\n${majorFeatureSections[`M${mMatch[1]}`]}`;
    }

    const item = createItem(db, {
      kind: row.kindGuess,
      title: row.title,
      effort: row.effort,
      status: row.status,
      notesMd,
    });
    createdByTitle[row.title] = item;
  }

  // 2. M5 "Forward-to-remind" exists only as prose (IN PROGRESS), no table
  // row in the original backlog.md — create its own tracker item.
  if (majorFeatureSections.M5) {
    const m5Item = createItem(db, {
      kind: 'feature',
      title: 'Forward-to-remind',
      status: 'in_progress',
      notesMd: `${majorFeatureSections.M5}\n\n_Migrated from backlog.md, M5 (Major features section, no table row — was in-progress prose only)._`,
    });
    createdByTitle['Forward-to-remind'] = m5Item;
  }

  // 3. Persona-based personalization onboarding is also prose-only (a
  // "Recently shipped" table row with no ID, `DEFERRED`, pointing at its
  // own `### Persona-based...` section) — already covered by rows loop
  // above only if it had a 6-col Tier table row, which it doesn't, so fold
  // it in as its own item too when present.
  if (majorFeatureSections.persona && !createdByTitle['Persona-based personalization onboarding']) {
    const personaItem = createItem(db, {
      kind: 'feature',
      title: 'Persona-based personalization onboarding',
      status: 'deferred',
      notesMd: `${majorFeatureSections.persona}\n\n_Migrated from backlog.md, Major features section (unreviewed branch, half-built, deferred)._`,
    });
    createdByTitle['Persona-based personalization onboarding'] = personaItem;
  }

  // 4. The 3-column "Unscoped / needs a decision" table.
  for (const row of unscopedRows) {
    const item = createItem(db, {
      kind: 'debt',
      title: row.title,
      status: 'open',
      notesMd: `${row.notesMd ? stripDanglingAnchors(row.notesMd) : ''}\n\n_Migrated from backlog.md, Unscoped table, ${row.legacyRef}._`.trim(),
    });
    createdByTitle[row.title] = item;
  }

  // 5. Second pass: add `blocks` rows for the unambiguous dependency
  // relationships found by reading the real notes text (see BLOCKS_BY_TITLE
  // above for the reasoning behind each).
  let blocksCreated = 0;
  for (const rel of BLOCKS_BY_TITLE) {
    const blocked = createdByTitle[rel.blockedTitle];
    const blocker = createdByTitle[rel.blockerTitle];
    if (!blocked || !blocker) continue;
    db.prepare(
      'INSERT OR IGNORE INTO blocks (item_id, blocked_by_id) VALUES (?, ?)'
    ).run(blocked.id, blocker.id);
    blocksCreated += 1;
  }

  return {
    itemCount: rows.length + unscopedRows.length
      + (majorFeatureSections.M5 ? 1 : 0)
      + (majorFeatureSections.persona && !rows.some(r => r.title === 'Persona-based personalization onboarding') ? 1 : 0),
    blocksCreated,
  };
}

if (require.main === module) {
  const backlogPath = path.join(__dirname, '../../backlog.md');
  const dbPath = path.join(__dirname, '../tracker.db');
  const repoRoot = path.join(__dirname, '../../');
  const force = process.argv.includes('--force');

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

  const existingCount = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  if (existingCount > 0 && !force) {
    console.error(
      `tracker.db already has ${existingCount} items — refusing to re-migrate. ` +
      `Delete tracker.db first if you really want to re-run this, or pass --force to proceed anyway.`
    );
    db.close();
    process.exit(1);
  }

  const { itemCount, blocksCreated } = migrate(db, markdownText);
  console.log(`Migrated ${itemCount} items and ${blocksCreated} blocks relationships from backlog.md into tracker.db`);
  db.close();
}

module.exports = {
  parseBacklog,
  parseUnscopedTable,
  extractMajorFeatureSections,
  stripDanglingAnchors,
  migrate,
  findOriginalBacklogContent,
  KIND_OVERRIDES,
  BLOCKS_BY_TITLE,
};
