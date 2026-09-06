# Work Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `backlog.md` with a small self-hosted work tracker — a
Node/Express + SQLite app with a filterable single-page UI — that keeps
stable IDs, dependency/blocking, effort sizing, and rich per-item notes,
and migrates `backlog.md`'s existing content into it.

**Architecture:** Standalone `tracker/` app (not a pnpm workspace member).
`node:sqlite` (built into Node, no native deps) backs a single `items`
table plus a `blocks` join table for dependencies. Express serves a JSON
API; a single static HTML page (vanilla JS, no build step) renders a
filterable list with a "Ready now" section and a per-item detail/edit
panel. A one-time Node script migrates `backlog.md`'s tables and prose
into the database, then `backlog.md` is replaced with a pointer file.

**Tech Stack:** Node.js 24 (`node:sqlite`, built-in `node:test` for the
migration/query-logic tests), Express, vanilla HTML/CSS/JS (a single small
markdown-rendering library loaded locally, no CDN, no framework).

**Spec:** [docs/superpowers/specs/2026-09-06-work-tracker-design.md](../specs/2026-09-06-work-tracker-design.md)

## Global Constraints

- Standalone folder `tracker/` at repo root — not a pnpm workspace
  member, not touched by root `pnpm run typecheck`/`build`.
- SQLite driver: `node:sqlite` (built-in, Node 22.5+; this repo runs
  Node 24) — no `better-sqlite3` npm dependency, per the driver decision
  made during planning (supersedes the spec's original suggestion).
- Data file `tracker/tracker.db` is gitignored — living data, not source.
  Schema is recreated from `tracker/schema.sql` on a fresh checkout.
- Server listens on port **4100** (fixed, avoids Metro's 3011 and
  api-server's 5000 per CLAUDE.md).
- Two distinct "blocked" signals, never conflated: manual `status='blocked'`
  vs. computed "has an unresolved blocker" (join against `blocks`,
  checking `blocked_by_id`'s status `!= 'done'`).
- IDs are `{PREFIX}-{n}` (`FEAT`, `BUG`, `SPIKE`, `DEBT`), assigned at
  creation from a per-prefix counter, immutable after creation.
- No auth, localhost only.
- No CDN dependencies — this tool never leaves localhost, but keep the
  house style of embedding rather than fetching external JS.

---

## File Structure

```
tracker/
  package.json            # standalone, name "remindme-tracker", no workspace ties
  schema.sql               # CREATE TABLE statements (source of truth for schema)
  db.js                    # opens tracker.db, applies schema.sql if tables missing
  server.js                # Express app: static file serving + API routes
  routes/items.js          # GET/POST/PATCH handlers for /api/items*
  queries.js               # ready-now / computed-blocked SQL, isolated for unit testing
  public/index.html         # single-page UI shell
  public/app.js             # fetch calls, filter state, rendering, edit-in-place
  public/style.css          # minimal styling
  public/vendor/marked.min.js  # local copy of a small markdown renderer (no CDN)
  scripts/migrate-backlog.js  # one-time backlog.md -> tracker.db importer (throwaway after use)
  test/queries.test.js      # node:test coverage for ready-now / computed-blocked logic
  test/migrate-backlog.test.js  # node:test coverage for the migration parser
  .gitignore                # tracker.db
```

- `db.js` is the only file that touches `node:sqlite` directly — every
  other module gets a `Database` instance passed in. This keeps the
  driver choice swappable and makes `queries.js`/`routes/items.js`
  testable against an in-memory DB.
- `queries.js` holds the one piece of actual logic (ready-now, computed-
  blocked) separated from route handling, so Task 5's tests don't need
  an HTTP server running.
- `scripts/migrate-backlog.js` is deliberately separate from `server.js`
  — run once, not part of the running app.

---

## Task 1: Schema + DB bootstrap

**Files:**
- Create: `tracker/schema.sql`
- Create: `tracker/db.js`
- Create: `tracker/package.json`
- Create: `tracker/.gitignore`
- Test: `tracker/test/db.test.js`

**Interfaces:**
- Produces: `openDb(path: string) -> DatabaseSync` (from `db.js`) — opens
  (or creates) the SQLite file at `path`, applies `schema.sql` if the
  `items` table doesn't exist yet, returns the live `node:sqlite`
  `DatabaseSync` instance. Every later task calls `openDb(...)` to get a
  handle.

- [ ] **Step 1: Write `tracker/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('feature','bug','spike','debt')),
  title        TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('open','in_progress','blocked','deferred','done'))
               DEFAULT 'open',
  effort       TEXT CHECK (effort IN ('S','M','L')),
  severity     TEXT CHECK (severity IN ('low','med','high')),
  notes_md     TEXT,
  finding_md   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at    TEXT
);

CREATE TABLE IF NOT EXISTS blocks (
  item_id       TEXT NOT NULL REFERENCES items(id),
  blocked_by_id TEXT NOT NULL REFERENCES items(id),
  PRIMARY KEY (item_id, blocked_by_id)
);

CREATE TABLE IF NOT EXISTS id_counters (
  prefix TEXT PRIMARY KEY,
  next_n INTEGER NOT NULL
);

INSERT OR IGNORE INTO id_counters (prefix, next_n) VALUES
  ('FEAT', 1), ('BUG', 1), ('SPIKE', 1), ('DEBT', 1);
```

- [ ] **Step 2: Write `tracker/db.js`**

```javascript
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

module.exports = { openDb };
```

- [ ] **Step 3: Write `tracker/package.json`**

```json
{
  "name": "remindme-tracker",
  "version": "1.0.0",
  "private": true,
  "description": "Local work tracker for remindme — replaces backlog.md",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

- [ ] **Step 4: Write `tracker/.gitignore`**

```
tracker.db
node_modules/
```

- [ ] **Step 5: Write the failing test `tracker/test/db.test.js`**

```javascript
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
  assert.deepStrictEqual(tables, ['blocks', 'id_counters', 'items', 'sqlite_sequence'].sort());

  db.close();
  fs.unlinkSync(tmpPath);
});
```

- [ ] **Step 6: Install dependencies and run test to verify it passes**

Run: `cd tracker && npm install && npm test`
Expected: PASS (1 test). If `sqlite_sequence` isn't present (no
AUTOINCREMENT columns exist so SQLite won't create it), remove it from
the expected array and re-run — confirm the actual table list first with
`node -e "..."` if the assertion fails, don't guess.

- [ ] **Step 7: Commit**

```bash
git add tracker/schema.sql tracker/db.js tracker/package.json tracker/.gitignore tracker/test/db.test.js tracker/package-lock.json
git commit -m "feat(tracker): add SQLite schema and DB bootstrap"
```

---

## Task 2: Item ID assignment + create/read queries

**Files:**
- Create: `tracker/queries.js`
- Test: `tracker/test/queries.test.js`

**Interfaces:**
- Consumes: `openDb` from Task 1 (tests open an in-memory-equivalent
  temp-file DB the same way `db.test.js` does).
- Produces:
  - `nextId(db, kind: 'feature'|'bug'|'spike'|'debt') -> string` — e.g.
    `nextId(db, 'bug')` returns `'BUG-1'`, increments the counter.
  - `createItem(db, { kind, title, effort, severity, notesMd }) -> item`
    — inserts a row using `nextId`, returns the full row as inserted.
  - `getItem(db, id) -> item | undefined` — row plus resolved
    `blockedBy: [{id, title, status}]` and `blocks: [{id, title, status}]`
    arrays (both directions of the `blocks` table).
  - `listItems(db, { kinds?: string[], statuses?: string[], blockedOnly?: boolean }) -> item[]`
    — AND-combined filters; `blockedOnly` filters to items with at least
    one unresolved computed blocker (see `isComputedBlocked` below).
  - `isComputedBlocked(db, id) -> boolean` — true if any row in `blocks`
    for this `item_id` points to a `blocked_by_id` whose `status != 'done'`.
  - `readyItems(db) -> item[]` — `status = 'open'` AND
    `isComputedBlocked` is false for every row.

- [ ] **Step 1: Write the failing tests `tracker/test/queries.test.js`**

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tracker && npm test`
Expected: FAIL — `queries.js` doesn't exist yet.

- [ ] **Step 3: Write `tracker/queries.js`**

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tracker && npm test`
Expected: PASS (all tests in `queries.test.js` plus the existing `db.test.js`).

- [ ] **Step 5: Commit**

```bash
git add tracker/queries.js tracker/test/queries.test.js
git commit -m "feat(tracker): add item CRUD queries and ready/blocked logic"
```

---

## Task 3: Express API routes

**Files:**
- Create: `tracker/routes/items.js`
- Create: `tracker/server.js`
- Test: `tracker/test/items-route.test.js`

**Interfaces:**
- Consumes: `openDb` (Task 1), `createItem`/`getItem`/`listItems`/
  `readyItems` (Task 2).
- Produces: `createItemsRouter(db) -> express.Router` mounted at `/api/items`
  by `server.js`, exposing:
  - `GET /api/items?kind=bug,spike&status=open,in_progress&blocked=true`
  - `GET /api/items/ready`
  - `GET /api/items/:id`
  - `POST /api/items` (body: `{kind, title, effort?, severity?, notesMd?}`)
  - `PATCH /api/items/:id` (body: any subset of mutable fields)
  - `POST /api/items/:id/blocks` (body: `{blockedById}`)
  - `DELETE /api/items/:id/blocks/:blockerId`
  `server.js` also serves `tracker/public/` as static files and listens
  on port 4100.

- [ ] **Step 1: Write the failing test `tracker/test/items-route.test.js`**

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tracker && npm test`
Expected: FAIL — `routes/items.js` doesn't exist yet.

- [ ] **Step 3: Write `tracker/routes/items.js`**

```javascript
const express = require('express');
const { createItem, getItem, listItems, readyItems } = require('../queries.js');

function createItemsRouter(db) {
  const router = express.Router();

  router.get('/ready', (req, res) => {
    res.json(readyItems(db));
  });

  router.get('/', (req, res) => {
    const kinds = req.query.kind ? req.query.kind.split(',') : undefined;
    const statuses = req.query.status ? req.query.status.split(',') : undefined;
    const blockedOnly = req.query.blocked === 'true';
    res.json(listItems(db, { kinds, statuses, blockedOnly }));
  });

  router.get('/:id', (req, res) => {
    const item = getItem(db, req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  });

  router.post('/', (req, res) => {
    const { kind, title, effort, severity, notesMd } = req.body;
    if (!kind || !title) {
      return res.status(400).json({ error: 'kind and title are required' });
    }
    const item = createItem(db, { kind, title, effort, severity, notesMd });
    res.status(201).json(item);
  });

  router.patch('/:id', (req, res) => {
    const existing = getItem(db, req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const fields = ['title', 'status', 'effort', 'severity', 'notes_md', 'finding_md'];
    const updates = [];
    const params = [];
    for (const f of fields) {
      const bodyKey = f === 'notes_md' ? 'notesMd' : f === 'finding_md' ? 'findingMd' : f;
      if (req.body[bodyKey] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[bodyKey]);
      }
    }
    if (req.body.status === 'done' && existing.status !== 'done') {
      updates.push("closed_at = datetime('now')");
    }
    updates.push("updated_at = datetime('now')");

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    res.json(getItem(db, req.params.id));
  });

  router.post('/:id/blocks', (req, res) => {
    const { blockedById } = req.body;
    db.prepare(
      'INSERT OR IGNORE INTO blocks (item_id, blocked_by_id) VALUES (?, ?)'
    ).run(req.params.id, blockedById);
    res.status(201).json(getItem(db, req.params.id));
  });

  router.delete('/:id/blocks/:blockerId', (req, res) => {
    db.prepare(
      'DELETE FROM blocks WHERE item_id = ? AND blocked_by_id = ?'
    ).run(req.params.id, req.params.blockerId);
    res.json(getItem(db, req.params.id));
  });

  return router;
}

module.exports = { createItemsRouter };
```

- [ ] **Step 4: Write `tracker/server.js`**

```javascript
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db.js');
const { createItemsRouter } = require('./routes/items.js');

const PORT = 4100;
const dbPath = path.join(__dirname, 'tracker.db');
const db = openDb(dbPath);

const app = express();
app.use(express.json());
app.use('/api/items', createItemsRouter(db));
app.use(express.static(path.join(__dirname, 'public')));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tracker running at http://localhost:${PORT}`);
  });
}

module.exports = { app };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd tracker && npm test`
Expected: PASS (all tests across all files).

- [ ] **Step 6: Commit**

```bash
git add tracker/routes/items.js tracker/server.js tracker/test/items-route.test.js
git commit -m "feat(tracker): add Express API routes for items and dependency links"
```

---

## Task 4: Single-page UI (list, filters, detail/edit panel)

**Files:**
- Create: `tracker/public/index.html`
- Create: `tracker/public/app.js`
- Create: `tracker/public/style.css`
- Create: `tracker/public/vendor/marked.min.js`

**Interfaces:**
- Consumes: the `/api/items`, `/api/items/ready`, `/api/items/:id` API
  from Task 3, called via `fetch` from `app.js`.
- Produces: nothing consumed by later tasks — this is the UI leaf.

This task has no automated tests per the spec's testing section
("CRUD route handlers and the UI itself: manual verification only"). Each
step is still a discrete, committable unit of work; verification is a
manual run against the running server.

- [ ] **Step 1: Download a local copy of a small markdown renderer**

Run: `curl -sL https://cdn.jsdelivr.net/npm/marked/marked.min.js -o tracker/public/vendor/marked.min.js`

This is a one-time local copy (not a runtime CDN fetch — the shipped app
loads it from `public/vendor/`, never from a network URL). Verify the
file is non-empty: `wc -c tracker/public/vendor/marked.min.js` should
show a size in the tens of KB, not 0.

- [ ] **Step 2: Write `tracker/public/index.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Work Tracker</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Work Tracker</h1>

  <section id="filters">
    <fieldset id="kind-filters">
      <legend>Kind</legend>
      <label><input type="checkbox" value="feature" checked> Feature</label>
      <label><input type="checkbox" value="bug" checked> Bug</label>
      <label><input type="checkbox" value="spike" checked> Spike</label>
      <label><input type="checkbox" value="debt" checked> Debt</label>
    </fieldset>
    <fieldset id="status-filters">
      <legend>Status</legend>
      <label><input type="checkbox" value="open" checked> Open</label>
      <label><input type="checkbox" value="in_progress" checked> In Progress</label>
      <label><input type="checkbox" value="blocked" checked> Blocked</label>
      <label><input type="checkbox" value="deferred" checked> Deferred</label>
      <label><input type="checkbox" value="done"> Done</label>
    </fieldset>
    <label><input type="checkbox" id="blocked-only-filter"> Show only computed-blocked</label>
  </section>

  <section id="ready-section">
    <h2>Ready now</h2>
    <ul id="ready-list"></ul>
  </section>

  <section id="add-item">
    <h2>Add item</h2>
    <form id="add-form">
      <select name="kind" required>
        <option value="feature">Feature</option>
        <option value="bug">Bug</option>
        <option value="spike">Spike</option>
        <option value="debt">Debt</option>
      </select>
      <input name="title" placeholder="Title" required>
      <select name="effort">
        <option value="">(no effort)</option>
        <option value="S">S</option>
        <option value="M">M</option>
        <option value="L">L</option>
      </select>
      <button type="submit">Add</button>
    </form>
  </section>

  <section id="list-section">
    <h2>All items</h2>
    <ul id="item-list"></ul>
  </section>

  <section id="detail-panel" hidden>
    <h2 id="detail-title"></h2>
    <div id="detail-meta"></div>
    <div id="detail-notes-rendered"></div>
    <textarea id="detail-notes-edit"></textarea>
    <button id="detail-save">Save notes</button>
    <div id="detail-blockers"></div>
    <form id="add-blocker-form">
      <input id="add-blocker-id" placeholder="Blocked by item ID (e.g. BUG-3)">
      <button type="submit">Add blocker</button>
    </form>
    <button id="detail-close">Close</button>
  </section>

  <script src="vendor/marked.min.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `tracker/public/style.css`**

```css
body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
fieldset { display: inline-block; margin-right: 1rem; }
#ready-section { background: #eef8ee; padding: 1rem; border-radius: 6px; margin: 1rem 0; }
ul { list-style: none; padding: 0; }
li { padding: 0.5rem; border-bottom: 1px solid #ddd; cursor: pointer; }
li:hover { background: #f5f5f5; }
.badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.3rem; }
.badge-kind { background: #ddd; }
.badge-status { background: #cce5ff; }
.badge-blocked-manual { background: #ffe0b3; }
.badge-blocked-computed { background: #ffb3b3; }
#detail-panel { border: 1px solid #ccc; padding: 1rem; margin-top: 1rem; border-radius: 6px; }
textarea { width: 100%; min-height: 150px; }
```

- [ ] **Step 4: Write `tracker/public/app.js`**

```javascript
const state = {
  selectedId: null,
};

function checkedValues(fieldsetId) {
  return Array.from(document.querySelectorAll(`#${fieldsetId} input:checked`))
    .map(el => el.value);
}

function renderBadges(item) {
  let html = `<span class="badge badge-kind">${item.kind}</span>`;
  html += `<span class="badge badge-status">${item.status}</span>`;
  if (item.status === 'blocked') html += `<span class="badge badge-blocked-manual">manually blocked</span>`;
  if (item.computedBlocked) html += `<span class="badge badge-blocked-computed">blocked by dependency</span>`;
  if (item.effort) html += `<span class="badge">${item.effort}</span>`;
  return html;
}

function renderList(targetId, items) {
  const ul = document.getElementById(targetId);
  ul.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.id}</strong> ${item.title} ${renderBadges(item)}`;
    li.addEventListener('click', () => openDetail(item.id));
    ul.appendChild(li);
  }
}

async function loadReady() {
  const res = await fetch('/api/items/ready');
  renderList('ready-list', await res.json());
}

async function loadList() {
  const kinds = checkedValues('kind-filters');
  const statuses = checkedValues('status-filters');
  const blockedOnly = document.getElementById('blocked-only-filter').checked;

  const params = new URLSearchParams();
  if (kinds.length > 0) params.set('kind', kinds.join(','));
  if (statuses.length > 0) params.set('status', statuses.join(','));
  if (blockedOnly) params.set('blocked', 'true');

  const res = await fetch(`/api/items?${params}`);
  renderList('item-list', await res.json());
}

async function refreshAll() {
  await Promise.all([loadReady(), loadList()]);
}

async function openDetail(id) {
  state.selectedId = id;
  const res = await fetch(`/api/items/${id}`);
  const item = await res.json();

  document.getElementById('detail-panel').hidden = false;
  document.getElementById('detail-title').textContent = `${item.id}: ${item.title}`;
  document.getElementById('detail-meta').innerHTML = renderBadges(item);
  document.getElementById('detail-notes-rendered').innerHTML = marked.parse(item.notes_md || '');
  document.getElementById('detail-notes-edit').value = item.notes_md || '';

  const blockersHtml = [
    '<strong>Blocked by:</strong> ' + (item.blockedBy.map(b => `${b.id} (${b.status})`).join(', ') || 'none'),
    '<strong>Blocks:</strong> ' + (item.blocks.map(b => `${b.id} (${b.status})`).join(', ') || 'none'),
  ].join('<br>');
  document.getElementById('detail-blockers').innerHTML = blockersHtml;
}

document.getElementById('detail-close').addEventListener('click', () => {
  document.getElementById('detail-panel').hidden = true;
  state.selectedId = null;
});

document.getElementById('detail-save').addEventListener('click', async () => {
  const notesMd = document.getElementById('detail-notes-edit').value;
  await fetch(`/api/items/${state.selectedId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notesMd }),
  });
  await openDetail(state.selectedId);
  await refreshAll();
});

document.getElementById('add-blocker-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const blockedById = document.getElementById('add-blocker-id').value.trim();
  if (!blockedById) return;
  await fetch(`/api/items/${state.selectedId}/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockedById }),
  });
  document.getElementById('add-blocker-id').value = '';
  await openDetail(state.selectedId);
  await refreshAll();
});

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await fetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: form.get('kind'),
      title: form.get('title'),
      effort: form.get('effort') || undefined,
    }),
  });
  e.target.reset();
  await refreshAll();
});

document.querySelectorAll('#filters input').forEach(el => el.addEventListener('change', loadList));

refreshAll();
```

- [ ] **Step 5: Manual verification**

Run: `cd tracker && npm start`, open `http://localhost:4100`.
Manually: add one item of each kind, confirm it appears in "All items";
add a second item and block it by the first via the detail panel's "Add
blocker" field, confirm it disappears from "Ready now" and shows the
red "blocked by dependency" badge; toggle kind/status filter checkboxes
and confirm the list updates; edit notes in the detail panel, save, close
and reopen the item, confirm the notes persisted.

- [ ] **Step 6: Commit**

```bash
git add tracker/public/
git commit -m "feat(tracker): add single-page UI with filters and detail panel"
```

---

## Task 5: Migrate backlog.md into the tracker

**Files:**
- Create: `tracker/scripts/migrate-backlog.js`
- Test: `tracker/test/migrate-backlog.test.js`
- Modify: `backlog.md` (replaced with a pointer file)
- Modify: `CLAUDE.md` (add "Work tracking" section)

**Interfaces:**
- Consumes: `openDb` (Task 1), `createItem` (Task 2).
- Produces: `parseBacklog(markdownText: string) -> Array<{legacyRef, kindGuess, title, effort, status, notesMd}>`
  — pure parsing function, testable without touching the DB.
  `migrate(db, markdownText)` — calls `parseBacklog` then `createItem`
  for each row, returns the count inserted.

The parser targets this repo's specific `backlog.md` table shape (`#`,
`Legacy #`, `Item`, `Effort`, `Status`, `Notes` columns) — it is not a
general markdown-table parser, matching the spec's note that this script
is throwaway after one run.

- [ ] **Step 1: Write the failing test `tracker/test/migrate-backlog.test.js`**

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tracker && npm test`
Expected: FAIL — `scripts/migrate-backlog.js` doesn't exist yet.

- [ ] **Step 3: Write `tracker/scripts/migrate-backlog.js`**

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tracker && npm test`
Expected: PASS (all tests).

- [ ] **Step 5: Run the migration against the real backlog.md and spot-check**

Run: `cd tracker && node scripts/migrate-backlog.js`
Expected output: `Migrated N items from backlog.md into tracker.db` with
N roughly matching the number of table rows across Tier 0/1/2 in
`backlog.md` (count them first: the design's known ambiguity is that
kind-guessing from the ID prefix is a heuristic, not a perfect
classification — spot-check at least 5 migrated items via
`curl http://localhost:4100/api/items/BUG-1` after starting the server,
and manually re-kind or edit notes for any that guessed wrong using the
UI's detail panel, since PATCH doesn't currently support changing
`kind` — if any need a kind change, delete and recreate via the UI's
add-item form instead, copying the notes over.

- [ ] **Step 6: Replace backlog.md with a pointer file**

```markdown
# Backlog moved

Open work tracking has moved to the local work tracker.

Run it: `cd tracker && npm start`, then open `http://localhost:4100`.

The old `backlog.md` content (as of 2026-09-06) was migrated into the
tracker's database and is preserved in git history — see
`git log --follow -- backlog.md` for the last full version.
```

- [ ] **Step 7: Add a "Work tracking" section to CLAUDE.md**

Add this section to `c:\workspace\remindme\CLAUDE.md`, placed after the
"Testing" section and before "Gotchas":

```markdown
## Work tracking

Open features/bugs/spikes/tech-debt are tracked in a local SQLite-backed
tracker (`tracker/`), not `backlog.md` (moved 2026-09-06 — see
`docs/superpowers/specs/2026-09-06-work-tracker-design.md`).

**Run it:** `cd tracker && npm start`, then open `http://localhost:4100`.

**Querying/updating from a session** (direct SQLite access — the tracker
is one file, `tracker/tracker.db`):

```bash
# What's ready to work on right now (open, no unresolved blockers)
sqlite3 tracker/tracker.db "SELECT id, title FROM items WHERE status='open'"

# Mark an item done after shipping it
sqlite3 tracker/tracker.db "UPDATE items SET status='done', closed_at=datetime('now') WHERE id='BUG-3'"
```

Prefer the tracker's own `queries.js` (`readyItems`, `listItems`) over
hand-written SQL for anything beyond a one-off lookup — it already
encodes the manual-vs-computed blocked distinction correctly.
```

- [ ] **Step 8: Commit**

```bash
git add tracker/scripts/migrate-backlog.js tracker/test/migrate-backlog.test.js backlog.md CLAUDE.md
git commit -m "feat(tracker): migrate backlog.md content, replace with pointer file"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), API + both blocked signals (Tasks
  2-3), filterable UI + ready-now + detail/edit (Task 4), migration +
  CLAUDE.md documentation (Task 5) — all spec sections have a task.
  The spec's "Claude Code access" section is covered by Task 5 Step 7.
- **Driver deviation from spec:** the spec named `better-sqlite3`; this
  plan uses `node:sqlite` per the decision made at the start of planning
  (Node 24 is already in use here, avoids any native-addon risk). Noted
  in Global Constraints so it's not missed.
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an
  exact manual-verification procedure.
- **Type consistency:** `getItem`'s shape (`blockedBy`/`blocks` arrays)
  is used identically in Task 3's route and Task 4's `app.js`. Field
  naming (`notesMd` in JS/JSON bodies vs. `notes_md` in SQL/response
  rows) is consistent across all tasks — the API always returns raw SQL
  column names (`notes_md`), and always accepts camelCase in request
  bodies (`notesMd`), matching Task 3's PATCH handler mapping.
- **Migration ambiguity:** Task 5 Step 5 explicitly surfaces (not hides)
  the kind-guessing heuristic's limits and gives a concrete manual
  fix-up path, per the spec's own callout of this as a known judgment
  call rather than an automatable step.
