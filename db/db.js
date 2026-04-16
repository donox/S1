const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(process.env.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Migrations for columns added to existing tables.
// ALTER TABLE ADD COLUMN is idempotent via try/catch — throws if column exists.
const MIGRATIONS = [
  // material_settings
  `ALTER TABLE material_settings ADD COLUMN role TEXT DEFAULT 'candidate'`,
  // usage_log
  `ALTER TABLE usage_log ADD COLUMN project_id INTEGER REFERENCES projects(id)`,
  `ALTER TABLE usage_log ADD COLUMN session_type TEXT DEFAULT 'laser'`,
  `ALTER TABLE usage_log ADD COLUMN status TEXT DEFAULT 'completed'`,
  `ALTER TABLE usage_log ADD COLUMN started_at TEXT`,
  `ALTER TABLE usage_log ADD COLUMN ended_at TEXT`,
  // Phase 1 — users
  `ALTER TABLE projects  ADD COLUMN owner_id INTEGER REFERENCES users(id)`,
  `ALTER TABLE usage_log ADD COLUMN user_id  INTEGER REFERENCES users(id)`,
  // Phase 2 — settings lineage + profiles
  `ALTER TABLE material_settings ADD COLUMN family_id INTEGER REFERENCES setting_families(id)`,
  `ALTER TABLE material_settings ADD COLUMN parent_id INTEGER REFERENCES material_settings(id)`,
  // Phase 3 — session runs
  `ALTER TABLE session_observations ADD COLUMN run_id INTEGER REFERENCES session_runs(id) ON DELETE CASCADE`,
  // Data migration: create run #1 for existing sessions that have material data
  `INSERT OR IGNORE INTO session_runs (session_id, run_number, material, operation, setting_id, file_used, outcome, notes)
   SELECT id, 1, material, operation, setting_id, file_used, outcome, notes
   FROM usage_log WHERE material IS NOT NULL`,
  // Phase 4 — artifacts
  `ALTER TABLE session_runs ADD COLUMN artifact_id INTEGER REFERENCES artifacts(id) ON DELETE SET NULL`,
  // Phase 3b — run_settings: migrate any existing session_runs.setting_id entries
  `INSERT OR IGNORE INTO run_settings (run_id, setting_id, sort_order)
   SELECT id, setting_id, 0 FROM session_runs WHERE setting_id IS NOT NULL`,
  `ALTER TABLE run_settings ADD COLUMN operation TEXT CHECK(operation IN ('engrave','score','cut'))`,
  `ALTER TABLE run_settings ADD COLUMN lines_per_inch INTEGER`,
  // External knowledge — Stage 1: source attribution on material_settings
  `ALTER TABLE material_settings ADD COLUMN source TEXT DEFAULT 'personal'`,
  `ALTER TABLE material_settings ADD COLUMN source_url TEXT`,
];

for (const sql of MIGRATIONS) {
  try { db.exec(sql); } catch (_) { /* column already exists — safe to ignore */ }
}

module.exports = db;
