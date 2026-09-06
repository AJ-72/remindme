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
