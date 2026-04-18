const { Router } = require('express');
const db = require('../db/db');
const { embed, cosineSimilarity, deserializeEmbedding } = require('../db/embed');

const router = Router();

// GET /api/docs/similar?context=pine+engraving&limit=3
router.get('/similar', async (req, res) => {
  try {
    const context = req.query.context;
    if (!context) return res.json([]);

    const limit = Math.min(parseInt(req.query.limit) || 3, 10);

    const queryVec = await embed(context);
    if (!queryVec) return res.json([]);

    const rows = db.prepare(
      'SELECT id, section, title, body, tags, source, source_url, embedding FROM docs_sections WHERE embedding IS NOT NULL'
    ).all();

    if (!rows.length) return res.json([]);

    const scored = rows
      .map(r => ({
        id: r.id, section: r.section, title: r.title,
        body: r.body, tags: r.tags, source: r.source, source_url: r.source_url,
        score: cosineSimilarity(queryVec, deserializeEmbedding(r.embedding)),
      }))
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);

    res.json(scored);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

// ── Candidates (bookmarklet clips) — must be before /:id ─────────

// POST /api/docs/candidates — save a clipped page
router.post('/candidates', (req, res) => {
  try {
    const { title, url, raw_text } = req.body;
    if (!raw_text) return res.status(400).json({ error: 'raw_text is required' });
    const info = db.prepare(
      'INSERT INTO doc_candidates (title, url, raw_text) VALUES (?, ?, ?)'
    ).run(title || url || 'Untitled', url || null, raw_text);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/docs/candidates — list pending clips
router.get('/candidates', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM doc_candidates ORDER BY created_at DESC').all());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/docs/candidates/:id — discard a clip
router.delete('/candidates/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM doc_candidates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/docs/candidates/:id/import — convert clip to docs_section + embed
router.post('/candidates/:id/import', async (req, res) => {
  try {
    const { section, title, body, tags, source } = req.body;
    if (!section || !title || !body) return res.status(400).json({ error: 'section, title, body required' });

    const candidate = db.prepare('SELECT * FROM doc_candidates WHERE id = ?').get(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const VALID_SOURCES = ['personal', 'xtool-official', 'community', 'other'];
    const src = VALID_SOURCES.includes(source) ? source : 'community';

    const { embed: embedFn, serializeEmbedding } = require('../db/embed');
    const vec = await embedFn([title, tags, body].filter(Boolean).join(' '));
    const embedding = vec ? serializeEmbedding(vec) : null;

    const info = db.prepare(
      'INSERT INTO docs_sections (section, title, body, tags, source, source_url, embedding) VALUES (?,?,?,?,?,?,?)'
    ).run(section, title, body, tags || null, src, candidate.url || null, embedding);

    db.prepare('DELETE FROM doc_candidates WHERE id = ?').run(req.params.id);

    res.json({ id: info.lastInsertRowid, embedded: !!vec });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Single doc and listing — /:id must come after named routes ────

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
