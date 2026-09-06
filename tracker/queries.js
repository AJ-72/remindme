function nextId(db, kind) {
  const prefix = { feature: 'FEAT', bug: 'BUG', spike: 'SPIKE', debt: 'DEBT' }[kind];
  if (!prefix) throw new Error(`Unknown kind: ${kind}`);

  const row = db.prepare('SELECT next_n FROM id_counters WHERE prefix = ?').get(prefix);
  const n = row.next_n;
  db.prepare('UPDATE id_counters SET next_n = ? WHERE prefix = ?').run(n + 1, prefix);
  return `${prefix}-${n}`;
}

function createItem(db, { kind, title, effort = null, severity = null, notesMd = null }) {
  const id = nextId(db, kind);
  db.prepare(
    `INSERT INTO items (id, kind, title, effort, severity, notes_md)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, kind, title, effort, severity, notesMd);
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

function readyItems(db) {
  return db.prepare("SELECT * FROM items WHERE status = 'open' ORDER BY created_at DESC")
    .all()
    .filter(r => !isComputedBlocked(db, r.id));
}

module.exports = { nextId, createItem, getItem, listItems, isComputedBlocked, readyItems };
