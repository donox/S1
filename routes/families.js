const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM setting_families WHERE 1=1';
    const params = [];
    if (req.query.material) { sql += ' AND material = ?'; params.push(req.query.material); }
    sql += ' ORDER BY material, profile_name';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { material, profile_name, description } = req.body;
    if (!material)     return res.status(400).json({ error: 'material is required' });
    if (!profile_name) return res.status(400).json({ error: 'profile_name is required' });
    const info = db.prepare(
      'INSERT INTO setting_families (material, profile_name, description) VALUES (?, ?, ?)'
    ).run(material.trim(), profile_name.trim(), description?.trim() ?? null);
    res.status(201).json(db.prepare('SELECT * FROM setting_families WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'A profile with that name already exists for this material' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const fam = db.prepare('SELECT * FROM setting_families WHERE id = ?').get(req.params.id);
    if (!fam) return res.status(404).json({ error: 'Not found' });
    const updates = [], values = [];
    if (req.body.profile_name !== undefined) { updates.push('profile_name = ?'); values.push(req.body.profile_name.trim()); }
    if (req.body.description  !== undefined) { updates.push('description = ?');  values.push(req.body.description?.trim() ?? null); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE setting_families SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM setting_families WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'A profile with that name already exists for this material' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const fam = db.prepare('SELECT * FROM setting_families WHERE id = ?').get(req.params.id);
    if (!fam) return res.status(404).json({ error: 'Not found' });
    const detached = db.prepare('SELECT COUNT(*) AS n FROM material_settings WHERE family_id = ?').get(req.params.id).n;
    db.prepare('UPDATE material_settings SET family_id = NULL WHERE family_id = ?').run(req.params.id);
    db.prepare('DELETE FROM setting_families WHERE id = ?').run(req.params.id);
    res.json({ deleted: true, detached_settings: detached });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
