const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT ms.*, sf.profile_name AS family_name
      FROM material_settings ms
      LEFT JOIN setting_families sf ON sf.id = ms.family_id
      WHERE 1=1`;
    const params = [];
    if (req.query.material)  { sql += ' AND ms.material = ?';   params.push(req.query.material); }
    if (req.query.operation) { sql += ' AND ms.operation = ?';  params.push(req.query.operation); }
    if (req.query.role)      { sql += ' AND ms.role = ?';       params.push(req.query.role); }
    if (req.query.family_id) { sql += ' AND ms.family_id = ?';  params.push(req.query.family_id); }
    if (!req.query.archived) { sql += " AND ms.role != 'archived'"; }
    if (req.query.starred)   { sql += ' AND ms.starred = 1'; }
    sql += ` ORDER BY ms.material, ms.operation,
      CASE ms.role WHEN 'confirmed' THEN 0 ELSE 1 END, ms.id DESC`;
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT ms.*, sf.profile_name AS family_name
      FROM material_settings ms
      LEFT JOIN setting_families sf ON sf.id = ms.family_id
      WHERE ms.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { material, operation, power, speed, lines_per_inch, passes,
            focus_offset_mm, notes, starred, role, family_id, parent_id } = req.body;
    if (!material)  return res.status(400).json({ error: 'material is required' });
    if (!operation) return res.status(400).json({ error: 'operation is required' });
    const info = db.prepare(`
      INSERT INTO material_settings
        (material, operation, power, speed, lines_per_inch, passes,
         focus_offset_mm, notes, starred, role, family_id, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(material, operation, power ?? null, speed ?? null, lines_per_inch ?? null,
           passes ?? 1, focus_offset_mm ?? 0, notes ?? null, starred ? 1 : 0,
           role ?? 'candidate', family_id ?? null, parent_id ?? null);
    res.status(201).json(db.prepare(`
      SELECT ms.*, sf.profile_name AS family_name
      FROM material_settings ms
      LEFT JOIN setting_families sf ON sf.id = ms.family_id
      WHERE ms.id = ?
    `).get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const fields = ['material','operation','power','speed','lines_per_inch','passes',
                    'focus_offset_mm','notes','starred','role','family_id'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE material_settings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare(`
      SELECT ms.*, sf.profile_name AS family_name
      FROM material_settings ms
      LEFT JOIN setting_families sf ON sf.id = ms.family_id
      WHERE ms.id = ?
    `).get(req.params.id));
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

// Confirm — scope to family_id when set, else material+operation
router.put('/:id/confirm', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const archiveAndConfirm = db.transaction(() => {
      if (row.family_id) {
        db.prepare(`
          UPDATE material_settings SET role = 'archived', updated_at = datetime('now')
          WHERE family_id = ? AND operation = ? AND role = 'confirmed' AND id != ?
        `).run(row.family_id, row.operation, row.id);
      } else {
        db.prepare(`
          UPDATE material_settings SET role = 'archived', updated_at = datetime('now')
          WHERE material = ? AND operation = ? AND role = 'confirmed' AND id != ?
        `).run(row.material, row.operation, row.id);
      }
      db.prepare(`
        UPDATE material_settings SET role = 'confirmed', updated_at = datetime('now') WHERE id = ?
      `).run(row.id);
    });
    archiveAndConfirm();
    res.json(db.prepare('SELECT * FROM material_settings WHERE id = ?').get(row.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

// Improve — archive parent, create candidate child with caller-supplied values
router.post('/:id/improve', (req, res) => {
  try {
    const parent = db.prepare('SELECT * FROM material_settings WHERE id = ?').get(req.params.id);
    if (!parent) return res.status(404).json({ error: 'Not found' });
    if (parent.role === 'archived') return res.status(400).json({ error: 'Cannot improve an archived setting' });

    const b = req.body;
    const improve = db.transaction(() => {
      db.prepare("UPDATE material_settings SET role = 'archived', updated_at = datetime('now') WHERE id = ?")
        .run(parent.id);
      const info = db.prepare(`
        INSERT INTO material_settings
          (material, operation, power, speed, lines_per_inch, passes,
           focus_offset_mm, notes, family_id, parent_id, role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate')
      `).run(
        parent.material,
        parent.operation,
        'power'          in b ? b.power          : parent.power,
        'speed'          in b ? b.speed          : parent.speed,
        'lines_per_inch' in b ? b.lines_per_inch : parent.lines_per_inch,
        'passes'         in b ? b.passes         : parent.passes,
        'focus_offset_mm' in b ? b.focus_offset_mm : parent.focus_offset_mm,
        'notes'          in b ? b.notes          : parent.notes,
        'family_id'      in b ? b.family_id      : parent.family_id,
        parent.id
      );
      return info.lastInsertRowid;
    });

    const newId = improve();
    res.status(201).json(db.prepare(`
      SELECT ms.*, sf.profile_name AS family_name
      FROM material_settings ms
      LEFT JOIN setting_families sf ON sf.id = ms.family_id
      WHERE ms.id = ?
    `).get(newId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
