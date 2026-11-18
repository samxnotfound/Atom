CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  icon        TEXT,
  archived_at INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  category_id  TEXT REFERENCES categories(id),
  title        TEXT,
  note         TEXT,
  mode         TEXT NOT NULL,
  planned_ms   INTEGER,
  actual_ms    INTEGER NOT NULL,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER NOT NULL,
  completed    INTEGER NOT NULL,
  source       TEXT NOT NULL DEFAULT 'timer',
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_started  ON sessions(started_at);
CREATE INDEX idx_sessions_category ON sessions(category_id);

CREATE TABLE active_session (
  id TEXT PRIMARY KEY, category_id TEXT, title TEXT, mode TEXT,
  planned_ms INTEGER, started_at INTEGER, paused_total_ms INTEGER,
  paused_at INTEGER, last_heartbeat INTEGER
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE streak_freezes (date TEXT PRIMARY KEY, used_at INTEGER NOT NULL);

CREATE TABLE standby_images (
  id         TEXT PRIMARY KEY,
  file_name  TEXT NOT NULL,
  source     TEXT NOT NULL,
  luminance  REAL,
  added_at   INTEGER NOT NULL
);
