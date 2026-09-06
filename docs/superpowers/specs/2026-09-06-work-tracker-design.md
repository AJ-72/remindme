# Work tracker — design spec

**Date:** 2026-09-06
**Status:** approved for planning

## Problem

`backlog.md` currently tracks all open features, bugs, spikes, and tech
debt for this project as one hand-maintained markdown file. It has grown
into a real asset (stable IDs, dependency tiers, a "recently shipped"
trail, long-form strategic notes on major features) but markdown is
becoming hard to maintain at this size: filtering ("show me just open bugs
that aren't blocked") means reading the whole file, dependency tracking is
manual prose ("blocked on B7"), and there's no query surface — just
scrolling.

Goal: replace `backlog.md` with a lightweight, self-hosted tracker — "a
lightweight Jira" — that keeps everything `backlog.md` does today (stable
IDs, effort sizing, dependency/blocking, rich per-item notes, status) but
backed by a real data store with a queryable/filterable UI, while staying
small enough that running it costs one command and no deploy pipeline.

## Non-goals

- Not a replacement for `handoffs/`, `docs/superpowers/specs/`,
  `docs/superpowers/plans/`, `system_learnings.md`, or `device-tests/` —
  those stay as-is; the tracker only replaces `backlog.md`'s job (open
  work tracking).
- Not multi-user, not auth'd, not deployed anywhere — runs on localhost
  for one user (Anand).
- Not a pnpm workspace member — standalone, so its dependencies never
  interact with the mobile app's carefully pinned versions.
- No CI, no build step for the frontend (plain HTML/JS).

## Architecture

**Location:** `tracker/` at repo root, standalone (own `package.json`, not
a pnpm workspace member, not touched by root `pnpm run typecheck`/`build`).

**Stack:** Node.js + Express serving a JSON API, plus a single static HTML
page (vanilla JS, no framework, no bundler) as the UI. Chosen for zero
build step and minimal dependencies. SQLite via `better-sqlite3` (sync
API, simplest to reason about for a single-user local tool).

**Data file:** `tracker/tracker.db` — gitignored (it's live data, not
source, same reasoning as any local dev database). A `tracker/seed.sql` or
migration script recreates the schema on a fresh checkout.

**Run:** `node tracker/server.js` (or `npm start` from `tracker/`),
listens on a fixed local port (e.g. 4100 — chosen to avoid the mobile
app's Metro port 3011 and the api-server's port 5000). Opens
`http://localhost:4100`.

## Schema

```sql
CREATE TABLE items (
  id           TEXT PRIMARY KEY,   -- e.g. 'BUG-12', 'FEAT-4', 'SPIKE-3', 'DEBT-2'
  kind         TEXT NOT NULL CHECK (kind IN ('feature','bug','spike','debt')),
  title        TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('open','in_progress','blocked','deferred','done'))
               DEFAULT 'open',
  effort       TEXT CHECK (effort IN ('S','M','L')),      -- nullable; optional for bugs/spikes
  severity     TEXT CHECK (severity IN ('low','med','high')), -- bugs only, nullable otherwise
  notes_md     TEXT,               -- rich markdown notes/description, replaces backlog.md prose
  finding_md   TEXT,               -- spikes only: the answer once resolved
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at    TEXT
);

CREATE TABLE blocks (
  item_id          TEXT NOT NULL REFERENCES items(id),
  blocked_by_id    TEXT NOT NULL REFERENCES items(id),
  PRIMARY KEY (item_id, blocked_by_id)
);

CREATE TABLE id_counters (
  prefix TEXT PRIMARY KEY,   -- 'FEAT', 'BUG', 'SPIKE', 'DEBT'
  next_n INTEGER NOT NULL
);
```

- IDs are assigned at creation time: `prefix-{next_n}`, then
  `id_counters.next_n` incremented. Immutable after creation (matches
  backlog.md's "don't renumber" rule).
- `kind`-specific fields (`severity`, `finding_md`) live as nullable
  columns on the same table rather than a join — simplest for a
  single-table, single-user tool; revisit only if kinds diverge much
  further.
- **Two distinct "blocked" signals**, not conflated:
  - `status = 'blocked'` — manually set, for "blocked on a decision/thing
    with no tracked item" (matches backlog.md's `BLOCKED` today).
  - **Computed** "has unresolved blocker" — derived by joining `blocks` →
    `items` and checking whether any `blocked_by_id` row has
    `status != 'done'`. Independent of the manual status field. An item
    can be `open` but computed-blocked (blocked by `BUG-7` which isn't
    done yet), and the UI shows this as a separate badge from manually-set
    `blocked` status.

## API (JSON, served by Express)

- `GET /api/items?kind=bug,spike&status=open,in_progress&blocked=true|false`
  — list with filters, AND-combined across kind/status, optional `blocked`
  filter using the computed signal above.
- `GET /api/items/ready` — convenience endpoint: `status='open'` AND no
  unresolved computed blockers. Replaces backlog.md's manual Tier
  0/1/2 grouping.
- `GET /api/items/:id` — single item detail, including its blockers
  (both directions: what blocks it, what it blocks) resolved to
  title+status.
- `POST /api/items` — create (kind, title, effort?, severity?, notes_md?).
  Server assigns the ID.
- `PATCH /api/items/:id` — update any mutable field (status, effort,
  notes_md, finding_md); sets `updated_at`; sets `closed_at` when status
  transitions to `done`.
- `POST /api/items/:id/blocks` / `DELETE /api/items/:id/blocks/:blockerId`
  — add/remove a blocking relationship.

No auth — bound to localhost only.

## UI

Single page, three regions:

1. **Filter bar** — checkboxes for kind (Feature/Bug/Spike/Debt, multi-
   select) and status (Open/In Progress/Blocked/Deferred/Done,
   multi-select), plus a "computed-blocked only" toggle. All filters
   combine as AND and update the list live (client-side fetch to
   `/api/items` with query params).
2. **List** — grouped with a "Ready now" section pinned at top (calls
   `/api/items/ready`), then the filtered list below grouped by status.
   Each row shows: ID, kind badge, title, effort, both blocked-signal
   badges (manual / computed) when applicable.
3. **Detail panel** (click a row) — full markdown-rendered `notes_md` (and
   `finding_md` for spikes), editable in place (textarea → PATCH on
   save), blocker management (add/remove by typing another item's ID),
   and an inline "add new item" form reachable from the list view.

Markdown rendering: a small client-side markdown-to-HTML pass is enough
(e.g. a single-file library loaded locally, no CDN needed since this
never leaves localhost) — kept minimal, not a rich editor.

## Claude Code access

Since `tracker.db` is a plain local SQLite file, Claude Code reads/writes
it directly via the `sqlite3` CLI (or a thin `tracker/query.js` helper
script if the CLI isn't installed) — no need to go through the HTTP API.
Document the exact commands in the project `CLAUDE.md` (under a new
"Work tracking" section) so this isn't re-derived per session, per the
user's global "script repeated sequences" rule. Typical operations:
mark an item done after shipping, file a new bug discovered mid-session,
query "what's ready" at the start of a session (folds into the existing
`catchup` skill).

## Migration from backlog.md

One-time Node script (`tracker/scripts/migrate-backlog.js`, not kept
around after use — throwaway per its one job):
- Parses `backlog.md`'s B#/M# tables → rows in `items`, preserving IDs
  by reusing the numeric suffix (`B1` → `BUG-1` or `FEAT-1` depending on
  content — needs a manual per-row kind judgment call during migration,
  not fully automatable, since backlog.md doesn't separate bugs from
  features by prefix consistently today).
- Parses "blocked on B7"-style prose into `blocks` rows where
  unambiguous; leaves anything ambiguous as prose inside `notes_md`
  rather than guessing.
- Folds each "Major features" essay (M2/M3/M4/M7/M8/M9 sections) into
  that item's `notes_md` verbatim (markdown survives as-is).
- Legacy numeric IDs (the pre-2026-09-04 numbering referenced from code
  comments/tests) get recorded as a line in the new item's `notes_md`
  ("Legacy #17") rather than a schema column, since they're a one-time
  historical reference, not an ongoing convention.
- After migration, `backlog.md` is replaced with a short pointer file:
  status/history stays in git for anyone who needs the old file, the
  live copy stops being maintained.

## Testing

Internal tool for one user — testing is deliberately light:
- The migration script gets real test coverage (data fidelity matters
  most since it's one-shot and not easily re-run against a moved-on
  backlog.md).
- The "ready now" / computed-blocked query logic gets unit tests (it's
  the one piece of actual logic, worth protecting from regressions).
- CRUD route handlers and the UI itself: manual verification only, no
  automated test suite — consistent with "boring internal tool," revisit
  only if this grows unexpectedly complex.

## Open questions carried into planning

- Exact port number and whether `better-sqlite3`'s native bindings need
  anything special on Windows (worth a quick spike during setup, not a
  blocker to the design).
- Whether `finding_md` should exist as a separate column from `notes_md`
  or just be a notes-field convention — leaning separate column since
  spikes have a clear "question vs. answer" shape, but this is small
  enough to adjust during implementation without re-approval.
