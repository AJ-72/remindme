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

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.id);
      db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    res.json(getItem(db, req.params.id));
  });

  router.post('/:id/blocks', (req, res) => {
    const { blockedById } = req.body;
    const item = getItem(db, req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    const blocker = getItem(db, blockedById);
    if (!blocker) return res.status(404).json({ error: 'not found' });
    db.prepare(
      'INSERT OR IGNORE INTO blocks (item_id, blocked_by_id) VALUES (?, ?)'
    ).run(req.params.id, blockedById);
    res.status(201).json(getItem(db, req.params.id));
  });

  router.delete('/:id/blocks/:blockerId', (req, res) => {
    const item = getItem(db, req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    db.prepare(
      'DELETE FROM blocks WHERE item_id = ? AND blocked_by_id = ?'
    ).run(req.params.id, req.params.blockerId);
    res.json(getItem(db, req.params.id));
  });

  return router;
}

module.exports = { createItemsRouter };
