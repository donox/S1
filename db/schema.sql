-- xTool S1 Guide — source-of-truth DDL
-- Executed by db/db.js at every startup (idempotent via IF NOT EXISTS)
-- ALTER TABLE migrations for existing DBs are handled in db.js

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  goal         TEXT,
  status       TEXT DEFAULT 'active' CHECK(status IN ('active','paused','complete','abandoned')),
  milestones   TEXT DEFAULT '{"design":false,"material_acquired":false,"test_run":false,"production":false,"finishing":false,"documented":false}',
  outcome      TEXT,
  started_at   TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS setting_families (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  material     TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  description  TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(material, profile_name)
);

CREATE TABLE IF NOT EXISTS material_settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  material        TEXT    NOT NULL,
  operation       TEXT    NOT NULL CHECK(operation IN ('engrave','score','cut')),
  power           INTEGER,
  speed           INTEGER,
  lines_per_inch  INTEGER,
  passes          INTEGER DEFAULT 1,
  focus_offset_mm REAL    DEFAULT 0,
  notes           TEXT,
  role            TEXT    DEFAULT 'candidate' CHECK(role IN ('candidate','confirmed','archived')),
  starred         INTEGER DEFAULT 0,
  source          TEXT    DEFAULT 'personal' CHECK(source IN ('personal','xtool-official','community','other')),
  source_url      TEXT,
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  session_type TEXT    DEFAULT 'laser',
  status       TEXT    DEFAULT 'completed' CHECK(status IN ('planned','in_progress','completed','aborted')),
  job_date     TEXT    NOT NULL,
  material     TEXT,
  operation    TEXT    CHECK(operation IN ('engrave','score','cut','mixed')),
  project_name TEXT,
  duration_min INTEGER,
  file_used    TEXT,
  setting_id   INTEGER REFERENCES material_settings(id),
  outcome      TEXT    CHECK(outcome IN ('success','partial','failed')),
  notes        TEXT,
  started_at   TEXT,
  ended_at     TEXT,
  created_at   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artifacts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL UNIQUE,
  description       TEXT,
  default_family_id INTEGER REFERENCES setting_families(id) ON DELETE SET NULL,
  power_delta       INTEGER,  -- ±% applied on top of base setting
  speed_delta       INTEGER,  -- ±mm/sec
  focus_delta       REAL,     -- ±mm
  passes_delta      INTEGER,  -- ±passes
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES usage_log(id) ON DELETE CASCADE,
  run_number      INTEGER NOT NULL DEFAULT 1,
  material        TEXT,
  operation       TEXT CHECK(operation IN ('engrave','score','cut')),
  setting_id      INTEGER REFERENCES material_settings(id),
  family_id       INTEGER REFERENCES setting_families(id),
  power_override  INTEGER,
  speed_override  INTEGER,
  passes_override INTEGER,
  focus_override  REAL,
  file_used       TEXT,
  outcome         TEXT CHECK(outcome IN ('success','partial','failed')),
  notes           TEXT,
  started_at      TEXT,
  ended_at        TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, run_number)
);

CREATE TABLE IF NOT EXISTS run_settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES session_runs(id) ON DELETE CASCADE,
  setting_id      INTEGER REFERENCES material_settings(id) ON DELETE SET NULL,
  operation       TEXT    CHECK(operation IN ('engrave','score','cut')),
  purpose         TEXT,
  power           INTEGER,
  speed           INTEGER,
  lines_per_inch  INTEGER,
  passes          INTEGER,
  focus_offset_mm REAL,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_observations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES usage_log(id) ON DELETE CASCADE,
  run_id       INTEGER REFERENCES session_runs(id) ON DELETE CASCADE,
  content      TEXT    NOT NULL,
  type         TEXT    DEFAULT 'note' CHECK(type IN ('note','discovery','issue','question')),
  outcome      TEXT    CHECK(outcome IN ('positive','negative','neutral','unexpected')),
  setting_id   INTEGER REFERENCES material_settings(id) ON DELETE SET NULL,
  dismissed_at TEXT,
  promoted_to  TEXT,
  promoted_id  INTEGER,
  created_at   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS docs_sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section    TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  tags       TEXT,
  source     TEXT DEFAULT 'personal',
  source_url TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts
  USING fts5(section, title, body, content='docs_sections', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS docs_fts_ai AFTER INSERT ON docs_sections BEGIN
  INSERT INTO docs_fts(rowid, section, title, body)
    VALUES (new.id, new.section, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS docs_fts_ad AFTER DELETE ON docs_sections BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, section, title, body)
    VALUES ('delete', old.id, old.section, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS docs_fts_au AFTER UPDATE ON docs_sections BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, section, title, body)
    VALUES ('delete', old.id, old.section, old.title, old.body);
  INSERT INTO docs_fts(rowid, section, title, body)
    VALUES (new.id, new.section, new.title, new.body);
END;

CREATE TABLE IF NOT EXISTS learning_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic      TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT DEFAULT 'note' CHECK(status IN ('note','learned','question','try')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT NOT NULL,
  filepath     TEXT NOT NULL UNIQUE,
  ext          TEXT,
  size_bytes   INTEGER,
  tag          TEXT DEFAULT 'keep' CHECK(tag IN ('keep','review','delete')),
  notes        TEXT,
  last_scanned TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_users (
  session_id INTEGER NOT NULL REFERENCES usage_log(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);
