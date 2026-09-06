function nextId(db, kind) {
  const prefix = { feature: 'FEAT', bug: 'BUG', spike: 'SPIKE', debt: 'DEBT' }[kind];
  if (!prefix) throw new Error(`Unknown kind: ${kind}`);

  const row = db.prepare('SELECT next_n FROM id_counters WHERE prefix = ?').get(prefix);
  const n = row.next_n;
  db.prepare('UPDATE id_counters SET next_n = ? WHERE prefix = ?').run(n + 1, prefix);
  return `${prefix}-${n}`;
}

function createItem(db, { kind, title, effort = null, severity = null, notesMd = null, status = 'open' }) {
  const id = nextId(db, kind);
  db.prepare(
    `INSERT INTO items (id, kind, title, effort, severity, notes_md, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, kind, title, effort, severity, notesMd, status);
  return getItem(db, id);
}

function resolveRefs(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id, title, status FROM items WHERE id IN (${placeholders})`
  ).all(...ids);
}

function getItem(db, id) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) return undefined;

  const blockedByIds = db.prepare('SELECT blocked_by_id FROM blocks WHERE item_id = ?')
    .all(id).map(r => r.blocked_by_id);
  const blocksIds = db.prepare('SELECT item_id FROM blocks WHERE blocked_by_id = ?')
    .all(id).map(r => r.item_id);

  item.blockedBy = resolveRefs(db, blockedByIds);
  item.blocks = resolveRefs(db, blocksIds);
  return item;
}

function isComputedBlocked(db, id) {
  const row = db.prepare(
    `SELECT COUNT(*) AS n
     FROM blocks b
     JOIN items i ON i.id = b.blocked_by_id
     WHERE b.item_id = ? AND i.status != 'done'`
  ).get(id);
  return row.n > 0;
}

function listItems(db, { kinds, statuses, blockedOnly } = {}) {
  const clauses = [];
  const params = [];

  if (kinds && kinds.length > 0) {
    clauses.push(`kind IN (${kinds.map(() => '?').join(',')})`);
    params.push(...kinds);
  }
  if (statuses && statuses.length > 0) {
    clauses.push(`status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM items ${where} ORDER BY created_at DESC`).all(...params);

  const withBlockState = rows.map(r => ({ ...r, computedBlocked: isComputedBlocked(db, r.id) }));
  return blockedOnly ? withBlockState.filter(r => r.computedBlocked) : withBlockState;
}

function getDorChecklist(db) {
  const row = db.prepare('SELECT criteria_json, updated_at FROM dor_checklist WHERE id = 1').get();
  return { criteria: JSON.parse(row.criteria_json), updatedAt: row.updated_at };
}

function saveDorChecklist(db, criteria) {
  // Millisecond-resolution timestamp (SQLite's plain datetime('now') is only
  // second-resolution, which could make two quick edits look identical and
  // hide a stale refinement — see passesDefinitionOfReady below).
  db.prepare(
    "UPDATE dor_checklist SET criteria_json = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = 1"
  ).run(JSON.stringify(criteria));
  return getDorChecklist(db);
}

function getRefinement(db, itemId) {
  const row = db.prepare('SELECT * FROM item_refinements WHERE item_id = ?').get(itemId);
  if (!row) return undefined;
  return {
    ...row,
    checklist: JSON.parse(row.checklist_json),
    openQuestions: JSON.parse(row.open_questions_json),
  };
}

function saveRefinement(db, itemId, {
  checklist, checklistVersion, acceptanceCriteriaMd, openQuestions,
  suggestedModel, suggestedModelReason, provider, modelUsed,
}) {
  db.prepare(`
    INSERT INTO item_refinements
      (item_id, checklist_json, checklist_version, acceptance_criteria_md,
       open_questions_json, suggested_model, suggested_model_reason, provider, model_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(item_id) DO UPDATE SET
      checklist_json = excluded.checklist_json,
      checklist_version = excluded.checklist_version,
      acceptance_criteria_md = excluded.acceptance_criteria_md,
      open_questions_json = excluded.open_questions_json,
      suggested_model = excluded.suggested_model,
      suggested_model_reason = excluded.suggested_model_reason,
      provider = excluded.provider,
      model_used = excluded.model_used,
      created_at = datetime('now')
  `).run(
    itemId, JSON.stringify(checklist), checklistVersion, acceptanceCriteriaMd || null,
    JSON.stringify(openQuestions || []), suggestedModel || null, suggestedModelReason || null,
    provider, modelUsed
  );
  return getRefinement(db, itemId);
}

// An item passes Definition of Ready when either no checklist has been set
// up yet (criteria.length === 0 — the original open+unblocked rule applies),
// or its stored refinement was run against the *current* checklist
// (matching checklist_version) and every criterion came back met.
function passesDefinitionOfReady(db, itemId, checklist) {
  if (!checklist || checklist.criteria.length === 0) return true;
  const refinement = getRefinement(db, itemId);
  if (!refinement || refinement.checklist_version !== checklist.updatedAt) return false;
  return refinement.checklist.every(c => c.met);
}

function readyItems(db) {
  const checklist = getDorChecklist(db);
  return db.prepare("SELECT * FROM items WHERE status = 'open' ORDER BY created_at DESC")
    .all()
    .filter(r => !isComputedBlocked(db, r.id))
    .filter(r => passesDefinitionOfReady(db, r.id, checklist));
}

// Open, unblocked items that a configured checklist is not (yet) satisfied
// by — the backlog-grooming queue. Empty whenever no checklist is set up,
// since then everything open+unblocked is already "ready".
function needsRefinementItems(db) {
  const checklist = getDorChecklist(db);
  if (checklist.criteria.length === 0) return [];
  return db.prepare("SELECT * FROM items WHERE status = 'open' ORDER BY created_at DESC")
    .all()
    .filter(r => !isComputedBlocked(db, r.id))
    .filter(r => !passesDefinitionOfReady(db, r.id, checklist));
}

module.exports = {
  nextId, createItem, getItem, listItems, isComputedBlocked, readyItems, needsRefinementItems,
  getDorChecklist, saveDorChecklist, getRefinement, saveRefinement,
};
