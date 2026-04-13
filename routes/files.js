const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

const router = Router();

router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM project_files WHERE 1=1';
    const params = [];
    if (req.query.ext) { sql += ' AND ext = ?';  params.push(req.query.ext); }
    if (req.query.tag) { sql += ' AND tag = ?';  params.push(req.query.tag); }
    sql += ' ORDER BY filename';
    res.json(db.prepare(sql).all(...params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/scan', (req, res) => {
  try {
    const dir = process.env.PROJECTS_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const upsert = db.prepare(`
      INSERT INTO project_files (filename, filepath, ext, size_bytes, last_scanned)
      VALUES (@filename, @filepath, @ext, @size_bytes, datetime('now'))
      ON CONFLICT(filepath) DO UPDATE SET
        size_bytes   = excluded.size_bytes,
        last_scanned = excluded.last_scanned
    `);

    const files = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => {
        const fp = path.join(dir, e.name);
        const stat = fs.statSync(fp);
        return { filename: e.name, filepath: fp, ext: path.extname(e.name).slice(1).toLowerCase(), size_bytes: stat.size };
      });

    const scanAll = db.transaction(() => files.forEach(f => upsert.run(f)));
    scanAll();
    res.json({ scanned: files.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/tag', (req, res) => {
  try {
    const { tag } = req.body;
    if (!tag) return res.status(400).json({ error: 'tag is required' });
    const info = db.prepare('UPDATE project_files SET tag = ? WHERE id = ?').run(tag, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM project_files WHERE id = ?').get(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM project_files WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/delete-file', (req, res) => {
  try {
    if (!req.body.confirm) return res.status(400).json({ error: 'confirm:true required' });
    const row = db.prepare('SELECT * FROM project_files WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(row.filepath);
    console.log(`[${new Date().toISOString()}] Deleted file: ${row.filepath}`);
    db.prepare('DELETE FROM project_files WHERE id = ?').run(req.params.id);
    res.json({ deleted: true, filepath: row.filepath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
