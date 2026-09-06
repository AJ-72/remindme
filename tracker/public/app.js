const state = {
  selectedId: null,
  readyItems: [],
  listItems: [],
  refineItems: [],
  heroId: null,
  dorCriteria: [],
};

const MODEL_SIZE_LABELS = { small: 'Small / fast model', medium: 'Mid-size model', large: 'Top-tier model' };

const spotlightScene = typeof TrackerScene !== 'undefined'
  ? TrackerScene.mountSpotlight(document.getElementById('hero-canvas'))
  : null;
if (typeof TrackerScene !== 'undefined') {
  TrackerScene.initBackground(document.getElementById('bg-canvas'));
}

const KIND_LABELS = { feature: 'Feature', bug: 'Bug', spike: 'Spike', debt: 'Debt' };
const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  deferred: 'Deferred',
  done: 'Done',
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function checkedValues(fieldsetId) {
  return Array.from(document.querySelectorAll(`#${fieldsetId} input:checked`))
    .map(el => el.value);
}

function renderBadges(item) {
  let html = `<span class="badge badge-kind-${item.kind}">${KIND_LABELS[item.kind] || item.kind}</span>`;
  html += `<span class="badge badge-status-${item.status}">${STATUS_LABELS[item.status] || item.status}</span>`;
  if (item.computedBlocked) html += `<span class="badge badge-blocked-computed">Blocked by dependency</span>`;
  if (item.effort) html += `<span class="badge badge-effort">${escapeHtml(item.effort)}</span>`;
  return html;
}

// URL-bearing attributes that can carry a javascript:/data: navigation or
// script-execution vector — checked against the same scheme allowlist.
const URL_ATTRS = ['href', 'src', 'data', 'formaction'];

// Sanitizes an HTML string produced by marked.parse() before it is assigned
// to innerHTML: removes <script>/<iframe>/<object>/<embed>/<base> elements
// outright (classic script-execution/navigation-hijack vectors that don't
// belong in migrated notes content at all), strips any href/src/data/
// formaction that isn't http(s)/anchor/relative/mailto (blocks javascript:
// links and same-shaped src/data attributes on iframe/object/embed), and
// strips any on*-prefixed event-handler attribute as defense in depth.
function sanitizeRenderedMarkdown(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('script, iframe, object, embed, base').forEach(el => el.remove());

  container.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (URL_ATTRS.includes(attr.name.toLowerCase()) && !/^(https?:|#|\/|mailto:)/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return container.innerHTML;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q);
}

function sortItems(items, sortKey) {
  const sorted = [...items];
  switch (sortKey) {
    case 'created_asc':
      sorted.reverse();
      break;
    case 'id_asc':
      sorted.sort((a, b) => a.id.localeCompare(b.id));
      break;
    case 'status_asc':
      sorted.sort((a, b) => a.status.localeCompare(b.status));
      break;
    default:
      // API already returns created_at DESC.
      break;
  }
  return sorted;
}

function renderList(targetId, emptyId, countId, items) {
  const ul = document.getElementById(targetId);
  ul.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="item-id">${item.id}</span>
      <span class="item-title">${escapeHtml(item.title)}</span>
      <span class="item-badges">${renderBadges(item)}</span>
    `;
    li.addEventListener('click', () => openDetail(item.id));
    ul.appendChild(li);
  }
  document.getElementById(emptyId).hidden = items.length > 0;
  document.getElementById(countId).textContent = items.length;
}

function applyListFilters() {
  const query = document.getElementById('search-input').value.trim();
  const sortKey = document.getElementById('sort-select').value;
  const filtered = state.listItems.filter(item => matchesSearch(item, query));
  renderList('item-list', 'list-empty', 'list-count', sortItems(filtered, sortKey));
}

function applyReadyFilters() {
  const query = document.getElementById('search-input').value.trim();
  const filtered = state.readyItems.filter(item => matchesSearch(item, query));
  renderList('ready-list', 'ready-empty', 'ready-count', filtered);
}

async function loadReady() {
  const res = await fetch('/api/items/ready');
  state.readyItems = await res.json();
  applyReadyFilters();
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
  state.listItems = await res.json();
  applyListFilters();
}

function pickOldestReady(items) {
  if (items.length === 0) return null;
  return items.reduce((oldest, item) => (item.created_at < oldest.created_at ? item : oldest));
}

function renderHero(item) {
  const content = document.getElementById('hero-content');
  const empty = document.getElementById('hero-empty');

  if (!item) {
    content.hidden = true;
    empty.hidden = false;
    if (spotlightScene) spotlightScene.setStage('empty');
    return;
  }

  content.hidden = false;
  empty.hidden = true;
  document.getElementById('hero-id').textContent = item.id;
  document.getElementById('hero-title').textContent = item.title;
  document.getElementById('hero-badges').innerHTML = renderBadges(item);

  const inProgress = item.status === 'in_progress';
  document.getElementById('hero-hint').textContent = inProgress
    ? 'In progress — fuel the finish and mark it done.'
    : 'Ready to go — no dependencies in the way.';
  document.getElementById('hero-start').hidden = inProgress;
  document.getElementById('hero-done').textContent = inProgress ? '🚀 Mark done' : '🚀 Done already?';

  if (spotlightScene) {
    spotlightScene.setKind(item.kind);
    spotlightScene.setStage(inProgress ? 'ignition' : 'idle');
  }
}

async function refreshHero() {
  let heroItem = null;

  if (state.heroId) {
    // Prefer the authoritative ready list (it already applies the Definition
    // of Ready gate) over re-fetching the item directly — a direct fetch
    // would only know the item isn't "done", not whether it still counts as
    // ready, and could keep spotlighting an item that just failed a newly
    // saved checklist.
    const stillReady = state.readyItems.find(i => i.id === state.heroId);
    if (stillReady) {
      heroItem = stillReady;
    } else {
      // Exception: once work has actually started (in_progress), keep it
      // pinned even though readyItems() only lists 'open' items — otherwise
      // clicking "Start working" would make the hero item vanish mid-task.
      const res = await fetch(`/api/items/${state.heroId}`);
      if (res.ok) {
        const item = await res.json();
        if (item.status === 'in_progress') heroItem = item;
      }
    }
  }

  if (!heroItem) {
    heroItem = pickOldestReady(state.readyItems);
    state.heroId = heroItem ? heroItem.id : null;
  }

  renderHero(heroItem);
}

async function loadNeedsRefinement() {
  const res = await fetch('/api/items/needs-refinement');
  state.refineItems = await res.json();
  renderList('refine-list', 'refine-empty', 'refine-count', state.refineItems);
  document.getElementById('refine-section').hidden = state.refineItems.length === 0;
}

async function refreshLists() {
  await Promise.all([loadReady(), loadList(), loadNeedsRefinement()]);
}

async function refreshAll() {
  await refreshLists();
  await refreshHero();
}

function renderDorCriteria() {
  const list = document.getElementById('dor-criteria-list');
  list.innerHTML = '';
  if (state.dorCriteria.length === 0) {
    list.innerHTML = '<p class="dor-empty-hint">No criteria yet — every open, unblocked item counts as ready.</p>';
    return;
  }
  state.dorCriteria.forEach((criterion, index) => {
    const row = document.createElement('div');
    row.className = 'dor-criterion-row';
    row.innerHTML = `<span>${escapeHtml(criterion)}</span><button type="button" class="dor-criterion-remove" aria-label="Remove">✕</button>`;
    row.querySelector('button').addEventListener('click', () => {
      state.dorCriteria.splice(index, 1);
      renderDorCriteria();
    });
    list.appendChild(row);
  });
}

function setDorStatus(text, isError = false) {
  const el = document.getElementById('dor-status');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

async function openDorModal() {
  document.getElementById('dor-modal-backdrop').hidden = false;
  setDorStatus('');
  const checklist = await (await fetch('/api/dor-checklist')).json();
  state.dorCriteria = checklist.criteria;
  renderDorCriteria();
}

function closeDorModal() {
  document.getElementById('dor-modal-backdrop').hidden = true;
}

function openAddModal() {
  document.getElementById('add-modal-backdrop').hidden = false;
}

function closeAddModal() {
  document.getElementById('add-modal-backdrop').hidden = true;
}

function renderRefinement(refinement) {
  const statusEl = document.getElementById('refine-status');
  const resultEl = document.getElementById('refine-result');

  if (!refinement) {
    statusEl.hidden = true;
    resultEl.hidden = true;
    return;
  }

  statusEl.hidden = true;
  resultEl.hidden = false;

  const checklistEl = document.getElementById('refine-checklist');
  checklistEl.innerHTML = '';
  for (const entry of refinement.checklist) {
    const li = document.createElement('li');
    li.className = entry.met ? 'met' : 'unmet';
    li.innerHTML = `
      <span class="refine-check-icon">${entry.met ? '✅' : '❌'}</span>
      <span>${escapeHtml(entry.criterion)}${entry.note ? `<span class="refine-check-note">${escapeHtml(entry.note)}</span>` : ''}</span>
    `;
    checklistEl.appendChild(li);
  }

  const acceptanceWrap = document.getElementById('refine-acceptance-wrap');
  const acceptanceMd = refinement.acceptance_criteria_md || '';
  acceptanceWrap.hidden = !acceptanceMd;
  const acceptanceEl = document.getElementById('refine-acceptance');
  acceptanceEl.innerHTML = sanitizeRenderedMarkdown(marked.parse(acceptanceMd));
  acceptanceEl.dataset.raw = acceptanceMd;

  const questionsWrap = document.getElementById('refine-questions-wrap');
  const questions = refinement.openQuestions || [];
  questionsWrap.hidden = questions.length === 0;
  document.getElementById('refine-questions').innerHTML = questions.map(q => `<li>${escapeHtml(q)}</li>`).join('');

  const modelEl = document.getElementById('refine-model');
  if (refinement.suggested_model) {
    modelEl.hidden = false;
    const label = MODEL_SIZE_LABELS[refinement.suggested_model] || refinement.suggested_model;
    modelEl.innerHTML = `<strong>${escapeHtml(label)}</strong>${refinement.suggested_model_reason ? ` — ${escapeHtml(refinement.suggested_model_reason)}` : ''}`;
  } else {
    modelEl.hidden = true;
  }

  document.getElementById('refine-meta').textContent =
    `Refined ${refinement.created_at} via ${refinement.provider}/${refinement.model_used}`;
}

async function openDetail(id) {
  state.selectedId = id;
  const res = await fetch(`/api/items/${id}`);
  const item = await res.json();

  document.getElementById('detail-backdrop').hidden = false;
  document.getElementById('detail-panel').hidden = false;
  document.getElementById('detail-title').textContent = `${item.id}: ${item.title}`;
  document.getElementById('detail-meta').innerHTML = renderBadges(item);
  document.getElementById('detail-notes-rendered').innerHTML = sanitizeRenderedMarkdown(marked.parse(item.notes_md || ''));
  document.getElementById('detail-notes-edit').value = item.notes_md || '';

  const blockersHtml = [
    '<strong>Blocked by:</strong> ' + (item.blockedBy.map(b => `${b.id} (${b.status})`).join(', ') || 'none'),
    '<strong>Blocks:</strong> ' + (item.blocks.map(b => `${b.id} (${b.status})`).join(', ') || 'none'),
  ].join('<br>');
  document.getElementById('detail-blockers').innerHTML = blockersHtml;

  const existingRefinement = await (await fetch(`/api/items/${id}/refinement`)).json();
  renderRefinement(existingRefinement);
}

function closeDetail() {
  document.getElementById('detail-backdrop').hidden = true;
  document.getElementById('detail-panel').hidden = true;
  state.selectedId = null;
}

document.getElementById('open-add-modal').addEventListener('click', openAddModal);
document.getElementById('add-modal-close').addEventListener('click', closeAddModal);
document.getElementById('add-form-cancel').addEventListener('click', closeAddModal);
document.getElementById('add-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'add-modal-backdrop') closeAddModal();
});

document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'detail-backdrop') closeDetail();
});

document.getElementById('open-dor-modal').addEventListener('click', openDorModal);
document.getElementById('dor-modal-close').addEventListener('click', closeDorModal);
document.getElementById('dor-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'dor-modal-backdrop') closeDorModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('detail-backdrop').hidden) closeDetail();
  if (!document.getElementById('add-modal-backdrop').hidden) closeAddModal();
  if (!document.getElementById('dor-modal-backdrop').hidden) closeDorModal();
});

document.getElementById('dor-add-criterion').addEventListener('click', () => {
  const input = document.getElementById('dor-new-criterion');
  const value = input.value.trim();
  if (!value) return;
  state.dorCriteria.push(value);
  input.value = '';
  renderDorCriteria();
});
document.getElementById('dor-new-criterion').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('dor-add-criterion').click();
  }
});

document.getElementById('dor-generate').addEventListener('click', async () => {
  setDorStatus('Asking the LLM for a draft…');
  try {
    const res = await fetch('/api/dor-checklist/generate', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Request failed');
    state.dorCriteria = body.criteria;
    renderDorCriteria();
    setDorStatus(`Drafted by ${body.provider}/${body.model}. Review, then save.`);
  } catch (err) {
    setDorStatus(err.message, true);
  }
});

document.getElementById('dor-save').addEventListener('click', async () => {
  setDorStatus('Saving…');
  const res = await fetch('/api/dor-checklist', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria: state.dorCriteria }),
  });
  const saved = await res.json();
  state.dorCriteria = saved.criteria;
  renderDorCriteria();
  setDorStatus('Saved.');
  await refreshAll();
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

document.getElementById('detail-refine').addEventListener('click', async () => {
  const statusEl = document.getElementById('refine-status');
  document.getElementById('refine-result').hidden = true;
  statusEl.hidden = false;
  statusEl.classList.remove('is-error');
  statusEl.textContent = 'Refining with AI…';

  try {
    const res = await fetch(`/api/items/${state.selectedId}/refine`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Request failed');
    renderRefinement(body);
    await refreshLists();
  } catch (err) {
    statusEl.hidden = false;
    statusEl.classList.add('is-error');
    statusEl.textContent = err.message;
  }
});

document.getElementById('refine-insert-notes').addEventListener('click', () => {
  const textarea = document.getElementById('detail-notes-edit');
  const acceptanceMd = document.getElementById('refine-acceptance').dataset.raw || '';
  textarea.value = textarea.value ? `${textarea.value}\n\n${acceptanceMd}` : acceptanceMd;
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
  closeAddModal();
  await refreshAll();
});

document.getElementById('hero-open').addEventListener('click', () => {
  if (state.heroId) openDetail(state.heroId);
});

document.getElementById('hero-start').addEventListener('click', async () => {
  if (!state.heroId) return;
  await fetch(`/api/items/${state.heroId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'in_progress' }),
  });
  await refreshAll();
});

document.getElementById('hero-done').addEventListener('click', async () => {
  if (!state.heroId) return;
  const doneId = state.heroId;
  await fetch(`/api/items/${doneId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' }),
  });

  await refreshLists();

  const finish = async () => {
    state.heroId = null;
    await refreshHero();
  };
  if (spotlightScene) {
    spotlightScene.launch(finish);
  } else {
    await finish();
  }
});

document.querySelectorAll('#filters input, #kind-filters input, #status-filters input, #blocked-only-filter')
  .forEach(el => el.addEventListener('change', loadList));
document.getElementById('search-input').addEventListener('input', () => {
  applyReadyFilters();
  applyListFilters();
});
document.getElementById('sort-select').addEventListener('change', applyListFilters);

refreshAll();
