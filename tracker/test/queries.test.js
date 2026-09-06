const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { openDb } = require('../db.js');
const {
  nextId, createItem, getItem, listItems, isComputedBlocked, readyItems,
} = require('../queries.js');

function freshDb(name) {
  const p = `${__dirname}/tmp-${name}.db`;
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { db: openDb(p), path: p };
}

test('nextId increments per prefix independently', () => {
  const { db, path } = freshDb('nextid');
  assert.strictEqual(nextId(db, 'bug'), 'BUG-1');
  assert.strictEqual(nextId(db, 'bug'), 'BUG-2');
  assert.strictEqual(nextId(db, 'feature'), 'FEAT-1');
  db.close(); fs.unlinkSync(path);
});

test('createItem inserts and getItem reads it back', () => {
  const { db, path } = freshDb('create');
  const item = createItem(db, { kind: 'bug', title: 'Snooze fails', effort: 'S' });
  assert.strictEqual(item.id, 'BUG-1');
  const fetched = getItem(db, 'BUG-1');
  assert.strictEqual(fetched.title, 'Snooze fails');
  assert.deepStrictEqual(fetched.blockedBy, []);
  assert.deepStrictEqual(fetched.blocks, []);
  db.close(); fs.unlinkSync(path);
});

test('isComputedBlocked reflects an open blocker', () => {
  const { db, path } = freshDb('blocked');
  const blocker = createItem(db, { kind: 'bug', title: 'Root cause' });
  const blocked = createItem(db, { kind: 'feature', title: 'Depends on fix' });
  db.prepare('INSERT INTO blocks (item_id, blocked_by_id) VALUES (?, ?)')
    .run(blocked.id, blocker.id);

  assert.strictEqual(isComputedBlocked(db, blocked.id), true);

  db.prepare("UPDATE items SET status = 'done' WHERE id = ?").run(blocker.id);
  assert.strictEqual(isComputedBlocked(db, blocked.id), false);
  db.close(); fs.unlinkSync(path);
});

test('readyItems excludes computed-blocked and non-open items', () => {
  const { db, path } = freshDb('ready');
  const blocker = createItem(db, { kind: 'bug', title: 'Blocker' });
  const blocked = createItem(db, { kind: 'feature', title: 'Blocked feature' });
  const ready = createItem(db, { kind: 'feature', title: 'Ready feature' });
  const done = createItem(db, { kind: 'feature', title: 'Done feature' });
  db.prepare('INSERT INTO blocks (item_id, blocked_by_id) VALUES (?, ?)')
    .run(blocked.id, blocker.id);
  db.prepare("UPDATE items SET status = 'done' WHERE id = ?").run(done.id);

  const ids = readyItems(db).map(i => i.id).sort();
  assert.deepStrictEqual(ids, [ready.id].sort());
  db.close(); fs.unlinkSync(path);
});

test('listItems applies kind, status, and blockedOnly filters together', () => {
  const { db, path } = freshDb('list');
  const blocker = createItem(db, { kind: 'bug', title: 'Blocker' });
  const blockedBug = createItem(db, { kind: 'bug', title: 'Blocked bug' });
  const openFeature = createItem(db, { kind: 'feature', title: 'Open feature' });
  db.prepare('INSERT INTO blocks (item_id, blocked_by_id) VALUES (?, ?)')
    .run(blockedBug.id, blocker.id);

  const bugsOnly = listItems(db, { kinds: ['bug'] }).map(i => i.id).sort();
  assert.deepStrictEqual(bugsOnly, [blocker.id, blockedBug.id].sort());

  const blockedOnly = listItems(db, { blockedOnly: true }).map(i => i.id);
  assert.deepStrictEqual(blockedOnly, [blockedBug.id]);

  const openFeatures = listItems(db, { kinds: ['feature'], statuses: ['open'] })
    .map(i => i.id);
  assert.deepStrictEqual(openFeatures, [openFeature.id]);
  db.close(); fs.unlinkSync(path);
});
