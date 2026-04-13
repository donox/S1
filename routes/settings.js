const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM material_settings WHERE 1=1';
    const params = [];
    if (req.query.material)  { sql += ' AND material = ?';          params.push(req.query.material); }
    if (req.query.operation) { sql += ' AND operation = ?';         params.push(req.query.operation); }
    if (req.query.role)      { sql += ' AND role = ?';              params.push(req.query.role); }
    if (!req.query.archived) { sql += " AND role != 'archived'"; }  // hide archived by default
    if (req.query.starred)   { sql += ' AND starred = 1'; }
    sql += ' ORDER BY material, operation, CASE role WHEN \'confirmed\' THEN 0 ELSE 1 END, id DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { material, operation, power, speed, lines_per_inch, passes, focus_offset_mm, notes, starred, role } = req.body;
    if (!material)  return res.status(400).json({ error: 'material is required' });
    if (!operation) return res.status(400).json({ error: 'operation is required' });
    const info = db.prepare(`
      INSERT INTO material_settings
        (material, operation, power, speed, lines_per_inch, passes, focus_offset_mm, notes, starred, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(material, operation, power ?? null, speed ?? null, lines_per_inch ?? null,
           passes ?? 1, focus_offset_mm ?? 0, notes ?? null, starred ? 1 : 0, role ?? 'candidate');
    res.status(201).json(db.prepare('SELECT * FROM material_settings WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const fields = ['material','operation','power','speed','lines_per_inch','passes','focus_offset_mm','notes','starred','role'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE material_settings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM material_settings WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/star', (req, res) => {
  try {
    const row = db.prepare('SELECT starred FROM material_settings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const next = row.starred ? 0 : 1;
    db.prepare("UPDATE material_settings SET starred = ?, updated_at = datetime('now') WHERE id = ?").run(next, req.params.id);
    res.json(db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Confirm a setting — archives any existing confirmed row for same (material, operation)
router.put('/:id/confirm', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const archiveAndConfirm = db.transaction(() => {
      // Archive existing confirmed row for this material+operation (if different)
      db.prepare(`
        UPDATE material_settings SET role = 'archived', updated_at = datetime('now')
        WHERE material = ? AND operation = ? AND role = 'confirmed' AND id != ?
      `).run(row.material, row.operation, row.id);
      // Confirm this row
      db.prepare(`
        UPDATE material_settings SET role = 'confirmed', updated_at = datetime('now') WHERE id = ?
      `).run(row.id);
    });
    archiveAndConfirm();
    res.json(db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Demote confirmed → candidate
router.put('/:id/unconfirm', (req, res) => {
  try {
    const info = db.prepare(
      "UPDATE material_settings SET role = 'candidate', updated_at = datetime('now') WHERE id = ?"
    ).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
