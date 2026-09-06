const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const express = require('express');
const { openDb } = require('../db.js');
const { createItemsRouter } = require('../routes/items.js');

function makeApp() {
  const dbPath = `${__dirname}/tmp-route.db`;
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);
  const app = express();
  app.use(express.json());
  app.use('/api/items', createItemsRouter(db));
  return { app, db, dbPath };
}

test('POST then GET /api/items/:id round-trips a created item', async () => {
  const { app, db, dbPath } = makeApp();
  const server = app.listen(0);
  const port = server.address().port;

  const createRes = await fetch(`http://localhost:${port}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bug', title: 'Test bug', effort: 'S' }),
  });
  assert.strictEqual(createRes.status, 201);
  const created = await createRes.json();
  assert.strictEqual(created.id, 'BUG-1');

  const getRes = await fetch(`http://localhost:${port}/api/items/${created.id}`);
  const fetched = await getRes.json();
  assert.strictEqual(fetched.title, 'Test bug');

  server.close(); db.close(); fs.unlinkSync(dbPath);
});

test('GET /api/items filters by kind and status', async () => {
  const { app, db, dbPath } = makeApp();
  const server = app.listen(0);
  const port = server.address().port;

  await fetch(`http://localhost:${port}/api/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bug', title: 'A bug' }),
  });
  await fetch(`http://localhost:${port}/api/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'feature', title: 'A feature' }),
  });

  const res = await fetch(`http://localhost:${port}/api/items?kind=bug&status=open`);
  const items = await res.json();
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].kind, 'bug');

  server.close(); db.close(); fs.unlinkSync(dbPath);
});

test('PATCH updates status and sets closed_at when done', async () => {
  const { app, db, dbPath } = makeApp();
  const server = app.listen(0);
  const port = server.address().port;

  const createRes = await fetch(`http://localhost:${port}/api/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bug', title: 'Fix me' }),
  });
  const { id } = await createRes.json();

  const patchRes = await fetch(`http://localhost:${port}/api/items/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  });
  const patched = await patchRes.json();
  assert.strictEqual(patched.status, 'done');
  assert.ok(patched.closed_at);

  server.close(); db.close(); fs.unlinkSync(dbPath);
});

test('POST and DELETE /api/items/:id/blocks manage dependency links', async () => {
  const { app, db, dbPath } = makeApp();
  const server = app.listen(0);
  const port = server.address().port;

  const a = await (await fetch(`http://localhost:${port}/api/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bug', title: 'Blocker' }),
  })).json();
  const b = await (await fetch(`http://localhost:${port}/api/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'feature', title: 'Blocked' }),
  })).json();

  await fetch(`http://localhost:${port}/api/items/${b.id}/blocks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockedById: a.id }),
  });

  const readyRes = await fetch(`http://localhost:${port}/api/items/ready`);
  const ready = await readyRes.json();
  assert.ok(!ready.some(i => i.id === b.id));

  await fetch(`http://localhost:${port}/api/items/${b.id}/blocks/${a.id}`, { method: 'DELETE' });
  const readyRes2 = await fetch(`http://localhost:${port}/api/items/ready`);
  const ready2 = await readyRes2.json();
  assert.ok(ready2.some(i => i.id === b.id));

  server.close(); db.close(); fs.unlinkSync(dbPath);
});
