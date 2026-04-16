const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT u.id, u.job_date, u.status, u.outcome, u.duration_min,
             u.file_used, u.notes, u.project_id, u.user_id, u.session_type,
             u.started_at, u.ended_at, u.created_at,
             p.name  AS project_name_resolved,
             usr.name AS user_name,
             (SELECT COUNT(*) FROM session_runs sr WHERE sr.session_id = u.id) AS run_count
      FROM usage_log u
      LEFT JOIN projects p   ON p.id  = u.project_id
      LEFT JOIN users    usr ON usr.id = u.user_id
      WHERE 1=1`;
    const params = [];
    if (req.query.from)       { sql += ' AND u.job_date >= ?';   params.push(req.query.from); }
    if (req.query.to)         { sql += ' AND u.job_date <= ?';   params.push(req.query.to); }
    if (req.query.outcome)    { sql += ' AND u.outcome = ?';     params.push(req.query.outcome); }
    if (req.query.status)     { sql += ' AND u.status = ?';      params.push(req.query.status); }
    if (req.query.project_id) { sql += ' AND u.project_id = ?';  params.push(req.query.project_id); }
    sql += ' ORDER BY u.job_date DESC, u.id DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT u.id, u.job_date, u.status, u.outcome, u.duration_min,
             u.file_used, u.notes, u.project_id, u.user_id, u.session_type,
             u.started_at, u.ended_at, u.created_at,
             p.name  AS project_name_resolved,
             usr.name AS user_name,
             (SELECT COUNT(*) FROM session_runs sr WHERE sr.session_id = u.id) AS run_count
      FROM usage_log u
      LEFT JOIN projects p   ON p.id  = u.project_id
      LEFT JOIN users    usr ON usr.id = u.user_id
      WHERE u.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const participants = db.prepare(`
      SELECT usr.id, usr.name FROM session_users su
      JOIN users usr ON usr.id = su.user_id
      WHERE su.session_id = ?
    `).all(req.params.id);
    const runs = db.prepare(`
      SELECT r.*, ms.power AS setting_power, ms.speed AS setting_speed,
             sf.profile_name AS family_name
      FROM session_runs r
      LEFT JOIN material_settings ms ON ms.id = r.setting_id
      LEFT JOIN setting_families  sf ON sf.id = r.family_id
      WHERE r.session_id = ? ORDER BY r.run_number
    `).all(req.params.id);
    res.json({ ...row, participants, runs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start a new in-progress session
router.post('/start', (req, res) => {
  try {
    const { project_id, material, operation, setting_id, file_used, notes, user_id } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    const create = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO usage_log
          (project_id, session_type, status, job_date, file_used, notes, user_id, started_at)
        VALUES (?, 'laser', 'in_progress', ?, ?, ?, ?, datetime('now'))
      `).run(project_id ?? null, today, file_used ?? null, notes ?? null, user_id ?? null);
      if (user_id) {
        db.prepare('INSERT OR IGNORE INTO session_users (session_id, user_id) VALUES (?, ?)')
          .run(info.lastInsertRowid, user_id);
      }
      // Auto-create run #1 when material is provided
      if (material) {
        db.prepare(`
          INSERT OR IGNORE INTO session_runs
            (session_id, run_number, material, operation, setting_id, file_used)
          VALUES (?, 1, ?, ?, ?, ?)
        `).run(info.lastInsertRowid, material, operation ?? null,
               setting_id ?? null, file_used ?? null);
      }
      return info;
    });
    const info = create();
    res.status(201).json(db.prepare(`
      SELECT u.id, u.job_date, u.status, u.outcome, u.duration_min,
             u.file_used, u.notes, u.project_id, u.user_id, u.session_type,
             u.started_at, u.ended_at, u.created_at,
             p.name  AS project_name_resolved,
             usr.name AS user_name,
             (SELECT COUNT(*) FROM session_runs sr WHERE sr.session_id = u.id) AS run_count
      FROM usage_log u
      LEFT JOIN projects p   ON p.id  = u.project_id
      LEFT JOIN users    usr ON usr.id = u.user_id
      WHERE u.id = ?
    `).get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { project_id, job_date, duration_min, file_used, outcome, notes } = req.body;
    if (!job_date) return res.status(400).json({ error: 'job_date is required' });
    const allowedStatus = ['planned','in_progress','completed'];
    const resolvedStatus = allowedStatus.includes(req.body.status) ? req.body.status : 'completed';
    const info = db.prepare(`
      INSERT INTO usage_log
        (project_id, session_type, status, job_date, duration_min, file_used, outcome, notes)
      VALUES (?, 'laser', ?, ?, ?, ?, ?, ?)
    `).run(project_id ?? null, resolvedStatus, job_date, duration_min ?? null,
           file_used ?? null, outcome ?? null, notes ?? null);
    res.status(201).json(db.prepare('SELECT * FROM usage_log WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM usage_log WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const fields = ['project_id','duration_min','file_used','outcome','notes','job_date','status','user_id'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE usage_log SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM usage_log WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Begin a planned session (planned → in_progress)
router.put('/:id/begin', (req, res) => {
  try {
    const row = db.prepare('SELECT status FROM usage_log WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.status !== 'planned') return res.status(400).json({ error: 'Session is not in planned status' });
    db.prepare("UPDATE usage_log SET status = 'in_progress', started_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json(db.prepare('SELECT * FROM usage_log WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Complete a session
router.put('/:id/complete', (req, res) => {
  try {
    const { outcome, notes, duration_min } = req.body;
    const row = db.prepare('SELECT * FROM usage_log WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const updates = ["status = 'completed'", "ended_at = datetime('now')"];
    const values = [];
    if (outcome)      { updates.push('outcome = ?');      values.push(outcome); }
    if (notes)        { updates.push('notes = ?');        values.push(notes); }
    if (duration_min) { updates.push('duration_min = ?'); values.push(duration_min); }
    values.push(req.params.id);
    db.prepare(`UPDATE usage_log SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM usage_log WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Abort a session
router.put('/:id/abort', (req, res) => {
  try {
    const info = db.prepare(
      "UPDATE usage_log SET status = 'aborted', ended_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM usage_log WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM usage_log WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
