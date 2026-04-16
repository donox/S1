const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.*, sf.profile_name AS default_profile_name, sf.material AS default_material
      FROM artifacts a
      LEFT JOIN setting_families sf ON sf.id = a.default_family_id
      ORDER BY a.name
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT a.*, sf.profile_name AS default_profile_name, sf.material AS default_material
      FROM artifacts a
      LEFT JOIN setting_families sf ON sf.id = a.default_family_id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, description, default_family_id,
            power_delta, speed_delta, focus_delta, passes_delta } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const info = db.prepare(`
      INSERT INTO artifacts (name, description, default_family_id,
                             power_delta, speed_delta, focus_delta, passes_delta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, description ?? null, default_family_id || null,
           power_delta ?? null, speed_delta ?? null,
           focus_delta ?? null, passes_delta ?? null);
    res.status(201).json(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM artifacts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const fields = ['name','description','default_family_id',
                    'power_delta','speed_delta','focus_delta','passes_delta'];
    const updates = [], values = [];
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE artifacts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM artifacts WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
