const express = require('express');
const { getItem, getDorChecklist, saveDorChecklist, getRefinement, saveRefinement } = require('../queries.js');
const { callLLM, isConfigured, extractJson } = require('../llm.js');

// Short, fixed project context so the LLM's suggestions (checklist wording,
// model-size recommendation) are grounded in what this backlog is actually
// for, without needing a settings screen for it.
const PROJECT_CONTEXT = `This backlog tracks feature/bug/spike/debt items for "Reminders", a
React Native + Expo mobile app for scheduling local notifications, with
voice dictation and Malayalam-script support. It is built and maintained
by a small team (often a single developer working with an AI coding
assistant). There is no working backend — everything ships client-side.`;

function llmErrorResponse(res, err) {
  if (err.code === 'LLM_NOT_CONFIGURED') {
    return res.status(503).json({ error: err.message, code: err.code });
  }
  console.error('LLM call failed:', err);
  return res.status(502).json({ error: 'The LLM call failed. See server logs for details.' });
}

function createRefinementRouter(db) {
  const router = express.Router();

  router.get('/llm-status', (req, res) => {
    res.json({ configured: isConfigured(), provider: process.env.LLM_PROVIDER || 'anthropic' });
  });

  router.get('/dor-checklist', (req, res) => {
    res.json(getDorChecklist(db));
  });

  router.put('/dor-checklist', (req, res) => {
    const { criteria } = req.body;
    if (!Array.isArray(criteria) || !criteria.every(c => typeof c === 'string')) {
      return res.status(400).json({ error: 'criteria must be an array of strings' });
    }
    res.json(saveDorChecklist(db, criteria.map(c => c.trim()).filter(Boolean)));
  });

  router.post('/dor-checklist/generate', async (req, res) => {
    const system = `You help small software teams write a practical Definition of Ready
checklist for their backlog tracker. Respond with ONLY a JSON object of the
shape {"criteria": string[]} — 5 to 8 short, concrete, checkable criteria
(each one sentence, no numbering). No other text.`;
    const prompt = `${PROJECT_CONTEXT}\n\nDraft a Definition of Ready checklist for this backlog.`;

    try {
      const { text, provider, model } = await callLLM({ system, prompt });
      const parsed = extractJson(text);
      if (!Array.isArray(parsed.criteria)) throw new Error('Response JSON had no "criteria" array.');
      res.json({ criteria: parsed.criteria, provider, model });
    } catch (err) {
      llmErrorResponse(res, err);
    }
  });

  router.get('/items/:id/refinement', (req, res) => {
    const refinement = getRefinement(db, req.params.id);
    res.json(refinement || null);
  });

  router.post('/items/:id/refine', async (req, res) => {
    const item = getItem(db, req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });

    const checklist = getDorChecklist(db);
    const blockedByText = item.blockedBy.length > 0
      ? item.blockedBy.map(b => `${b.id} (${b.status})`).join(', ')
      : 'none';

    const system = `You are a meticulous backlog refinement assistant for a small software
team. You review one backlog item and help make it truly ready to build.
Respond with ONLY a single JSON object of this shape:
{
  "checklist": [{"criterion": string, "met": boolean, "note": string}],
  "acceptanceCriteriaMd": string,
  "openQuestions": string[],
  "suggestedModel": "small" | "medium" | "large",
  "suggestedModelReason": string
}
- "checklist" must have exactly one entry per criterion given, in the same order.
- "acceptanceCriteriaMd" is a short markdown checklist (- [ ] items), written
  from what's already known about the item; do not invent scope that isn't
  implied by the title/notes.
- "openQuestions" lists only real, specific blockers to clarity — omit it
  (empty array) if the item is already clear enough to build.
- "suggestedModel" is the smallest model class that can safely build this:
  "small" for a trivial, well-scoped, low-risk change; "medium" for typical
  feature/bug work; "large" for complex, ambiguous, or architecturally risky
  work. "suggestedModelReason" is one sentence grounded in this specific item.
No other text, no markdown code fence around the JSON.`;

    const prompt = `${PROJECT_CONTEXT}

Definition of Ready checklist:
${checklist.criteria.length > 0 ? checklist.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : '(none configured — still fill in acceptanceCriteriaMd, openQuestions, suggestedModel; return "checklist": [])'}

Item to review:
- ID: ${item.id}
- Kind: ${item.kind}
- Title: ${item.title}
- Status: ${item.status}
- Effort: ${item.effort || '(none set)'}
- Blocked by: ${blockedByText}
- Notes:
${item.notes_md || '(no notes)'}`;

    try {
      const { text, provider, model } = await callLLM({ system, prompt });
      const parsed = extractJson(text);
      if (!Array.isArray(parsed.checklist)) throw new Error('Response JSON had no "checklist" array.');

      const saved = saveRefinement(db, item.id, {
        checklist: parsed.checklist,
        checklistVersion: checklist.updatedAt,
        acceptanceCriteriaMd: parsed.acceptanceCriteriaMd || '',
        openQuestions: parsed.openQuestions || [],
        suggestedModel: parsed.suggestedModel || null,
        suggestedModelReason: parsed.suggestedModelReason || null,
        provider,
        modelUsed: model,
      });
      res.json(saved);
    } catch (err) {
      llmErrorResponse(res, err);
    }
  });

  return router;
}

module.exports = { createRefinementRouter };
