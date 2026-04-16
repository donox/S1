const { Router } = require('express');
const db = require('../db/db');

const router = Router();

router.get('/search', (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'q is required' });
    const rows = db.prepare(`
      SELECT d.id, d.section, d.title, d.body, d.tags, d.source, d.source_url
      FROM docs_fts f
      JOIN docs_sections d ON d.id = f.rowid
      WHERE docs_fts MATCH ?
      ORDER BY rank
    `).all(q);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM docs_sections WHERE 1=1';
    const params = [];
    if (req.query.section) { sql += ' AND section = ?'; params.push(req.query.section); }
    if (req.query.tags)    { sql += ' AND tags LIKE ?';  params.push(`%${req.query.tags}%`); }
    if (req.query.source)  { sql += ' AND source = ?';   params.push(req.query.source); }
    sql += ' ORDER BY section, id';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM docs_sections WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
