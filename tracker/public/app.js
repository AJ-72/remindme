const state = {
  selectedId: null,
  readyItems: [],
  listItems: [],
};

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

async function refreshAll() {
  await Promise.all([loadReady(), loadList()]);
}

function openAddModal() {
  document.getElementById('add-modal-backdrop').hidden = false;
}

function closeAddModal() {
  document.getElementById('add-modal-backdrop').hidden = true;
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('detail-backdrop').hidden) closeDetail();
  if (!document.getElementById('add-modal-backdrop').hidden) closeAddModal();
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
  closeAddModal();
  await refreshAll();
});

document.querySelectorAll('#filters input, #kind-filters input, #status-filters input, #blocked-only-filter')
  .forEach(el => el.addEventListener('change', loadList));
document.getElementById('search-input').addEventListener('input', () => {
  applyReadyFilters();
  applyListFilters();
});
document.getElementById('sort-select').addEventListener('change', applyListFilters);

refreshAll();
