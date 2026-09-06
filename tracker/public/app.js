const state = {
  selectedId: null,
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
  let html = `<span class="badge badge-kind">${item.kind}</span>`;
  html += `<span class="badge badge-status">${item.status}</span>`;
  if (item.status === 'blocked') html += `<span class="badge badge-blocked-manual">manually blocked</span>`;
  if (item.computedBlocked) html += `<span class="badge badge-blocked-computed">blocked by dependency</span>`;
  if (item.effort) html += `<span class="badge">${escapeHtml(item.effort)}</span>`;
  return html;
}

// Sanitizes an HTML string produced by marked.parse() before it is assigned
// to innerHTML: strips any <script> tag outright, strips any href that
// isn't http(s)/anchor/relative/mailto (blocks javascript: links), and
// strips any on*-prefixed event-handler attribute as defense in depth.
function sanitizeRenderedMarkdown(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('script').forEach(el => el.remove());

  container.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (attr.name === 'href' && !/^(https?:|#|\/|mailto:)/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return container.innerHTML;
}

function renderList(targetId, items) {
  const ul = document.getElementById(targetId);
  ul.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.id}</strong> ${escapeHtml(item.title)} ${renderBadges(item)}`;
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
  document.getElementById('detail-notes-rendered').innerHTML = sanitizeRenderedMarkdown(marked.parse(item.notes_md || ''));
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
