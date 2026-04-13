const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM learning_notes WHERE 1=1';
    const params = [];
    if (req.query.status) { sql += ' AND status = ?'; params.push(req.query.status); }
    if (req.query.topic)  { sql += ' AND topic LIKE ?'; params.push(`%${req.query.topic}%`); }
    sql += ' ORDER BY updated_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { topic, content, status } = req.body;
    if (!topic)   return res.status(400).json({ error: 'topic is required' });
    if (!content) return res.status(400).json({ error: 'content is required' });
    const info = db.prepare(`
      INSERT INTO learning_notes (topic, content, status) VALUES (?, ?, ?)
    `).run(topic, content, status ?? 'note');
    res.status(201).json(db.prepare('SELECT * FROM learning_notes WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM learning_notes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const fields = ['topic', 'content', 'status'];
    const updates = [];
    const values = [];
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE learning_notes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM learning_notes WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM learning_notes WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
