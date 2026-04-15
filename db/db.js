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
];

for (const sql of MIGRATIONS) {
  try { db.exec(sql); } catch (_) { /* column already exists — safe to ignore */ }
}

module.exports = db;
