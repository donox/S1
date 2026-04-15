const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM projects  WHERE owner_id = u.id) AS project_count,
        (SELECT COUNT(*) FROM usage_log WHERE user_id  = u.id) AS session_count
      FROM users u
      ORDER BY u.is_default DESC, u.name ASC
    `).all();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, is_default } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (is_default) db.prepare('UPDATE users SET is_default = 0').run();
    const info = db.prepare(
      'INSERT INTO users (name, is_default) VALUES (?, ?)'
    ).run(name.trim(), is_default ? 1 : 0);
    res.status(201).json(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'A user with that name already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/set-default', (req, res) => {
  try {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const setDefault = db.transaction(id => {
      db.prepare('UPDATE users SET is_default = 0').run();
      db.prepare('UPDATE users SET is_default = 1 WHERE id = ?').run(id);
    });
    setDefault(req.params.id);
    res.json(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const updates = [], values = [];
    if (req.body.name !== undefined) { updates.push('name = ?'); values.push(req.body.name.trim()); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'A user with that name already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const projCount = db.prepare('SELECT COUNT(*) AS n FROM projects  WHERE owner_id = ?').get(req.params.id).n;
    const sessCount = db.prepare('SELECT COUNT(*) AS n FROM usage_log WHERE user_id  = ?').get(req.params.id).n;
    if ((projCount > 0 || sessCount > 0) && !req.query.force) {
      return res.status(409).json({
        error: `User owns ${projCount} project(s) and ${sessCount} session(s). Ownership will be removed.`,
        project_count: projCount,
        session_count: sessCount,
      });
    }
    db.prepare('UPDATE projects  SET owner_id = NULL WHERE owner_id = ?').run(req.params.id);
    db.prepare('UPDATE usage_log SET user_id  = NULL WHERE user_id  = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
