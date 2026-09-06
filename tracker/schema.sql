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

-- Definition-of-Ready checklist: a single editable row of criteria that an
-- item must satisfy before it counts as truly "ready" (see item_refinements
-- below). Empty criteria_json ('[]') means no checklist has been set up yet
-- — readiness then falls back to the old open+unblocked rule.
CREATE TABLE IF NOT EXISTS dor_checklist (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  criteria_json TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

INSERT OR IGNORE INTO dor_checklist (id, criteria_json) VALUES (1, '[]');

-- Latest LLM-assisted refinement result for one item. checklist_version
-- records dor_checklist.updated_at at the time this refinement ran, so a
-- later checklist edit can be told apart from a stale result.
CREATE TABLE IF NOT EXISTS item_refinements (
  item_id                 TEXT PRIMARY KEY REFERENCES items(id),
  checklist_json          TEXT NOT NULL,
  checklist_version       TEXT NOT NULL,
  acceptance_criteria_md  TEXT,
  open_questions_json     TEXT NOT NULL DEFAULT '[]',
  suggested_model         TEXT,
  suggested_model_reason  TEXT,
  provider                TEXT NOT NULL,
  model_used              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
