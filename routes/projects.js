const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT p.*, u.name AS owner_name
      FROM projects p
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE 1=1`;
    const params = [];
    if (req.query.status) { sql += ' AND p.status = ?'; params.push(req.query.status); }
    sql += ' ORDER BY p.status ASC, p.created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const project = db.prepare(`
      SELECT p.*, u.name AS owner_name
      FROM projects p
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    const sessions = db.prepare(
      'SELECT * FROM usage_log WHERE project_id = ? ORDER BY job_date DESC, id DESC'
    ).all(req.params.id);
    res.json({ ...project, sessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, goal, status, owner_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const info = db.prepare(`
      INSERT INTO projects (name, goal, status, owner_id)
      VALUES (?, ?, ?, ?)
    `).run(name, goal ?? null, status ?? 'active', owner_id ?? null);
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });

    const fields = ['name', 'goal', 'status', 'milestones', 'outcome', 'owner_id'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (f in req.body) {
        updates.push(`${f} = ?`);
        values.push(f === 'milestones' && typeof req.body[f] === 'object'
          ? JSON.stringify(req.body[f])
          : req.body[f]);
      }
    }

    // Auto-set completed_at when status flips to complete
    if (req.body.status === 'complete' && project.status !== 'complete') {
      updates.push("completed_at = datetime('now')");
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    // Detach sessions rather than block deletion
    db.prepare('UPDATE usage_log SET project_id = NULL WHERE project_id = ?').run(req.params.id);
    const info = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
