const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { openDb } = require('../db.js');
const {
  nextId, createItem, getItem, listItems, isComputedBlocked, readyItems, needsRefinementItems,
  getDorChecklist, saveDorChecklist, getRefinement, saveRefinement,
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

test('createItem with explicit status preserves it', () => {
  const { db, path } = freshDb('create-status');
  const blocked = createItem(db, { kind: 'bug', title: 'Blocked task', status: 'blocked' });
  const deferred = createItem(db, { kind: 'feature', title: 'Deferred task', status: 'deferred' });
  const open = createItem(db, { kind: 'bug', title: 'Open task' }); // defaults to 'open'

  assert.strictEqual(blocked.status, 'blocked');
  assert.strictEqual(deferred.status, 'deferred');
  assert.strictEqual(open.status, 'open');

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
  assert.deepStrictEqual(ids, [blocker.id, ready.id].sort());
  db.close(); fs.unlinkSync(path);
});

test('dor_checklist starts empty and round-trips through save/get', () => {
  const { db, path } = freshDb('dor-checklist');
  assert.deepStrictEqual(getDorChecklist(db).criteria, []);

  const saved = saveDorChecklist(db, ['Has acceptance criteria', 'Estimated']);
  assert.deepStrictEqual(saved.criteria, ['Has acceptance criteria', 'Estimated']);
  assert.deepStrictEqual(getDorChecklist(db).criteria, saved.criteria);
  db.close(); fs.unlinkSync(path);
});

test('readyItems falls back to open+unblocked when no checklist is configured', () => {
  const { db, path } = freshDb('ready-no-checklist');
  const ready = createItem(db, { kind: 'feature', title: 'Ready feature' });
  assert.deepStrictEqual(readyItems(db).map(i => i.id), [ready.id]);
  assert.deepStrictEqual(needsRefinementItems(db), []);
  db.close(); fs.unlinkSync(path);
});

test('readyItems requires a passing, current-checklist refinement once a checklist is set', () => {
  const { db, path } = freshDb('ready-with-checklist');
  const item = createItem(db, { kind: 'feature', title: 'Needs refinement' });
  const checklist = saveDorChecklist(db, ['Has acceptance criteria']);

  // Not yet refined against this checklist -> not ready, shows as needing refinement.
  assert.deepStrictEqual(readyItems(db).map(i => i.id), []);
  assert.deepStrictEqual(needsRefinementItems(db).map(i => i.id), [item.id]);

  // Refined, but a criterion failed -> still not ready.
  saveRefinement(db, item.id, {
    checklist: [{ criterion: 'Has acceptance criteria', met: false, note: 'missing' }],
    checklistVersion: checklist.updatedAt,
    acceptanceCriteriaMd: '', openQuestions: [], suggestedModel: 'small',
    suggestedModelReason: 'trivial', provider: 'anthropic', modelUsed: 'claude-sonnet-5',
  });
  assert.deepStrictEqual(readyItems(db).map(i => i.id), []);
  assert.deepStrictEqual(needsRefinementItems(db).map(i => i.id), [item.id]);

  // Refined and passing -> ready.
  saveRefinement(db, item.id, {
    checklist: [{ criterion: 'Has acceptance criteria', met: true, note: 'looks good' }],
    checklistVersion: checklist.updatedAt,
    acceptanceCriteriaMd: '- [ ] Do the thing', openQuestions: [], suggestedModel: 'small',
    suggestedModelReason: 'trivial', provider: 'anthropic', modelUsed: 'claude-sonnet-5',
  });
  assert.deepStrictEqual(readyItems(db).map(i => i.id), [item.id]);
  assert.deepStrictEqual(needsRefinementItems(db), []);

  // Editing the checklist invalidates the old refinement.
  saveDorChecklist(db, ['Has acceptance criteria', 'Estimated']);
  assert.deepStrictEqual(readyItems(db).map(i => i.id), []);
  assert.deepStrictEqual(needsRefinementItems(db).map(i => i.id), [item.id]);

  db.close(); fs.unlinkSync(path);
});

test('saveRefinement upserts — a second call replaces the first', () => {
  const { db, path } = freshDb('refinement-upsert');
  const item = createItem(db, { kind: 'bug', title: 'Flaky test' });
  const checklist = saveDorChecklist(db, ['Estimated']);

  saveRefinement(db, item.id, {
    checklist: [{ criterion: 'Estimated', met: false, note: 'no effort set' }],
    checklistVersion: checklist.updatedAt,
    acceptanceCriteriaMd: '', openQuestions: ['What triggers the flake?'], suggestedModel: 'medium',
    suggestedModelReason: 'needs investigation', provider: 'anthropic', modelUsed: 'claude-sonnet-5',
  });
  saveRefinement(db, item.id, {
    checklist: [{ criterion: 'Estimated', met: true, note: 'now S' }],
    checklistVersion: checklist.updatedAt,
    acceptanceCriteriaMd: '- [ ] Fix it', openQuestions: [], suggestedModel: 'small',
    suggestedModelReason: 'now scoped', provider: 'anthropic', modelUsed: 'claude-sonnet-5',
  });

  const refinement = getRefinement(db, item.id);
  assert.strictEqual(refinement.checklist[0].met, true);
  assert.deepStrictEqual(refinement.openQuestions, []);
  assert.strictEqual(refinement.suggested_model, 'small');
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
