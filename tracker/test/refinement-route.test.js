const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const express = require('express');
const { openDb } = require('../db.js');
const { createItemsRouter } = require('../routes/items.js');
const { createRefinementRouter } = require('../routes/refinement.js');
const llm = require('../llm.js');

// t.after (not inline cleanup at the end of the test body) so a server/db
// handle is always closed even when an assertion throws mid-test — leaving
// one open would hang the whole `node --test` run waiting for it.
function makeApp(t) {
  const dbPath = `${__dirname}/tmp-refine-route.db`;
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);
  const app = express();
  app.use(express.json());
  app.use('/api/items', createItemsRouter(db));
  app.use('/api', createRefinementRouter(db));
  const server = app.listen(0);
  const port = server.address().port;

  t.after(() => {
    server.close();
    db.close();
    fs.unlinkSync(dbPath);
  });

  return { baseUrl: `http://localhost:${port}` };
}

// Mocks only llm.js's own outbound call (see llm.js's __setFetchForTests) —
// deliberately NOT global.fetch, which these tests also use to call their
// own local server; stubbing that too would make every request in this file
// return the LLM stub's body instead of ever reaching the server.
function stubLlmFetch(t, body, status = 200) {
  llm.__setFetchForTests(async () => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  t.after(() => llm.__setFetchForTests(null));
}

function withEnv(t, key, value) {
  const original = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });
}

test('GET /api/llm-status reports unconfigured with no API key set', async (t) => {
  const { baseUrl } = makeApp(t);
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  t.after(() => { if (original !== undefined) process.env.ANTHROPIC_API_KEY = original; });

  const body = await (await fetch(`${baseUrl}/api/llm-status`)).json();
  assert.strictEqual(body.configured, false);
  assert.strictEqual(body.provider, 'anthropic');
});

test('GET/PUT /api/dor-checklist round-trips criteria', async (t) => {
  const { baseUrl } = makeApp(t);

  const initial = await (await fetch(`${baseUrl}/api/dor-checklist`)).json();
  assert.deepStrictEqual(initial.criteria, []);

  const putRes = await fetch(`${baseUrl}/api/dor-checklist`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria: ['Has acceptance criteria', '  ', 'Estimated'] }),
  });
  const saved = await putRes.json();
  assert.deepStrictEqual(saved.criteria, ['Has acceptance criteria', 'Estimated']);

  const badRes = await fetch(`${baseUrl}/api/dor-checklist`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria: 'not an array' }),
  });
  assert.strictEqual(badRes.status, 400);
});

test('POST /api/dor-checklist/generate returns 503 when the LLM is not configured', async (t) => {
  const { baseUrl } = makeApp(t);
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  t.after(() => { if (original !== undefined) process.env.ANTHROPIC_API_KEY = original; });

  const res = await fetch(`${baseUrl}/api/dor-checklist/generate`, { method: 'POST' });
  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.code, 'LLM_NOT_CONFIGURED');
});

test('POST /api/dor-checklist/generate parses the LLM JSON reply into criteria', async (t) => {
  const { baseUrl } = makeApp(t);
  withEnv(t, 'ANTHROPIC_API_KEY', 'test-key');
  stubLlmFetch(t, { content: [{ text: '{"criteria": ["Has acceptance criteria", "Estimated"]}' }] });

  const res = await fetch(`${baseUrl}/api/dor-checklist/generate`, { method: 'POST' });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body.criteria, ['Has acceptance criteria', 'Estimated']);
  assert.strictEqual(body.provider, 'anthropic');
});

test('POST /api/items/:id/refine returns 404 for a missing item', async (t) => {
  const { baseUrl } = makeApp(t);
  const res = await fetch(`${baseUrl}/api/items/NOPE/refine`, { method: 'POST' });
  assert.strictEqual(res.status, 404);
});

test('POST /api/items/:id/refine saves the result, then GET returns it', async (t) => {
  const { baseUrl } = makeApp(t);
  withEnv(t, 'ANTHROPIC_API_KEY', 'test-key');

  await fetch(`${baseUrl}/api/dor-checklist`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria: ['Has acceptance criteria'] }),
  });
  const created = await (await fetch(`${baseUrl}/api/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bug', title: 'Fix the thing' }),
  })).json();

  const llmReply = {
    checklist: [{ criterion: 'Has acceptance criteria', met: true, note: 'clear enough' }],
    acceptanceCriteriaMd: '- [ ] Fix the thing',
    openQuestions: [],
    suggestedModel: 'small',
    suggestedModelReason: 'well-scoped fix',
  };
  stubLlmFetch(t, { content: [{ text: JSON.stringify(llmReply) }] });

  const refineRes = await fetch(`${baseUrl}/api/items/${created.id}/refine`, { method: 'POST' });
  assert.strictEqual(refineRes.status, 200);
  const refined = await refineRes.json();
  assert.strictEqual(refined.suggested_model, 'small');
  assert.strictEqual(refined.checklist[0].met, true);

  const fetched = await (await fetch(`${baseUrl}/api/items/${created.id}/refinement`)).json();
  assert.strictEqual(fetched.suggested_model, 'small');

  const ready = await (await fetch(`${baseUrl}/api/items/ready`)).json();
  assert.ok(ready.some(i => i.id === created.id));
});
