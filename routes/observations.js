const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM session_observations WHERE 1=1';
    const params = [];
    if (req.query.session_id) { sql += ' AND session_id = ?'; params.push(req.query.session_id); }
    if (req.query.run_id)     { sql += ' AND run_id = ?';     params.push(req.query.run_id); }
    if (req.query.dismissed === 'false') { sql += ' AND dismissed_at IS NULL'; }
    if (req.query.dismissed === 'true')  { sql += ' AND dismissed_at IS NOT NULL'; }
    sql += ' ORDER BY created_at ASC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    let { session_id, run_id, content, type } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    // If run_id provided without session_id, look up session_id from the run
    if (run_id && !session_id) {
      const run = db.prepare('SELECT session_id FROM session_runs WHERE id = ?').get(run_id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      session_id = run.session_id;
    }
    if (!session_id) return res.status(400).json({ error: 'session_id or run_id is required' });

    const session = db.prepare('SELECT id FROM usage_log WHERE id = ?').get(session_id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const info = db.prepare(`
      INSERT INTO session_observations (session_id, run_id, content, type) VALUES (?, ?, ?, ?)
    `).run(session_id, run_id ?? null, content, type ?? 'note');
    res.status(201).json(db.prepare('SELECT * FROM session_observations WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/dismiss', (req, res) => {
  try {
    const info = db.prepare(
      "UPDATE session_observations SET dismissed_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM session_observations WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Promote to learning_note
router.post('/:id/promote/note', (req, res) => {
  try {
    const obs = db.prepare('SELECT * FROM session_observations WHERE id = ?').get(req.params.id);
    if (!obs) return res.status(404).json({ error: 'Not found' });

    const { topic, status } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const noteInfo = db.prepare(`
      INSERT INTO learning_notes (topic, content, status) VALUES (?, ?, ?)
    `).run(topic, obs.content, status ?? 'note');

    db.prepare(`
      UPDATE session_observations
      SET dismissed_at = datetime('now'), promoted_to = 'learning_note', promoted_id = ?
      WHERE id = ?
    `).run(noteInfo.lastInsertRowid, obs.id);

    res.json({
      observation: db.prepare('SELECT * FROM session_observations WHERE id = ?').get(obs.id),
      note:        db.prepare('SELECT * FROM learning_notes WHERE id = ?').get(noteInfo.lastInsertRowid),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Promote to material_setting candidate
router.post('/:id/promote/setting', (req, res) => {
  try {
    const obs = db.prepare('SELECT * FROM session_observations WHERE id = ?').get(req.params.id);
    if (!obs) return res.status(404).json({ error: 'Not found' });

    const { material, operation, power, speed, lines_per_inch, passes, focus_offset_mm } = req.body;
    if (!material)  return res.status(400).json({ error: 'material is required' });
    if (!operation) return res.status(400).json({ error: 'operation is required' });

    const settingInfo = db.prepare(`
      INSERT INTO material_settings
        (material, operation, power, speed, lines_per_inch, passes, focus_offset_mm, notes, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate')
    `).run(material, operation, power ?? null, speed ?? null, lines_per_inch ?? null,
           passes ?? 1, focus_offset_mm ?? 0, obs.content);

    db.prepare(`
      UPDATE session_observations
      SET dismissed_at = datetime('now'), promoted_to = 'material_setting', promoted_id = ?
      WHERE id = ?
    `).run(settingInfo.lastInsertRowid, obs.id);

    res.json({
      observation: db.prepare('SELECT * FROM session_observations WHERE id = ?').get(obs.id),
      setting:     db.prepare('SELECT * FROM material_settings WHERE id = ?').get(settingInfo.lastInsertRowid),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Purge dismissed observations older than 90 days
router.delete('/purge', (req, res) => {
  try {
    const info = db.prepare(`
      DELETE FROM session_observations
      WHERE dismissed_at IS NOT NULL
        AND dismissed_at < datetime('now', '-90 days')
    `).run();
    res.json({ purged: info.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM session_observations WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
