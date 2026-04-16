const { Router } = require('express');
const db = require('../db/db');

const router = Router();

// Prepared statement reused in list and single routes
// rs.operation takes precedence; fall back to the linked setting's operation for display
const getRunSettings = db.prepare(`
  SELECT rs.*,
         COALESCE(rs.operation, ms.operation) AS effective_operation,
         ms.power AS setting_power, ms.speed AS setting_speed,
         ms.lines_per_inch AS setting_lpi,
         ms.operation AS setting_operation, ms.material AS setting_material,
         ms.passes AS setting_passes, ms.focus_offset_mm AS setting_focus
  FROM run_settings rs
  LEFT JOIN material_settings ms ON ms.id = rs.setting_id
  WHERE rs.run_id = ?
  ORDER BY rs.sort_order, rs.id
`);

// ── List runs for a session ───────────────────────────────────────
router.get('/', (req, res) => {
  try {
    if (!req.query.session_id) return res.status(400).json({ error: 'session_id is required' });
    const rows = db.prepare(`
      SELECT r.*, sf.profile_name AS family_name,
             a.name AS artifact_name, a.power_delta, a.speed_delta,
             a.focus_delta, a.passes_delta
      FROM session_runs r
      LEFT JOIN setting_families sf ON sf.id = r.family_id
      LEFT JOIN artifacts        a  ON a.id  = r.artifact_id
      WHERE r.session_id = ?
      ORDER BY r.run_number
    `).all(req.query.session_id);
    res.json(rows.map(r => ({ ...r, settings: getRunSettings.all(r.id) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Single run with settings + observations ───────────────────────
router.get('/:id', (req, res) => {
  try {
    const run = db.prepare(`
      SELECT r.*, sf.profile_name AS family_name,
             a.name AS artifact_name, a.power_delta, a.speed_delta,
             a.focus_delta, a.passes_delta
      FROM session_runs r
      LEFT JOIN setting_families sf ON sf.id = r.family_id
      LEFT JOIN artifacts        a  ON a.id  = r.artifact_id
      WHERE r.id = ?
    `).get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    const settings     = getRunSettings.all(req.params.id);
    const observations = db.prepare(`
      SELECT * FROM session_observations WHERE run_id = ? ORDER BY created_at
    `).all(req.params.id);
    res.json({ ...run, settings, observations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create run ────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { session_id, material, file_used, outcome, notes } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    const session = db.prepare('SELECT id FROM usage_log WHERE id = ?').get(session_id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const maxRow   = db.prepare('SELECT MAX(run_number) AS m FROM session_runs WHERE session_id = ?').get(session_id);
    const runNumber = (maxRow.m ?? 0) + 1;

    const info = db.prepare(`
      INSERT INTO session_runs (session_id, run_number, material, file_used, outcome, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(session_id, runNumber, material ?? null, file_used ?? null, outcome ?? null, notes ?? null);

    const created = db.prepare('SELECT * FROM session_runs WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ...created, settings: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update run (partial) ──────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const run = db.prepare('SELECT * FROM session_runs WHERE id = ?').get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Not found' });

    const fields = ['material','artifact_id','file_used','outcome','notes','started_at','ended_at'];
    const updates = [], values = [];
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    db.prepare(`UPDATE session_runs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM session_runs WHERE id = ?').get(req.params.id);
    res.json({ ...updated, settings: getRunSettings.all(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete run ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM session_runs WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Add setting to run ────────────────────────────────────────────
router.post('/:id/settings', (req, res) => {
  try {
    const run = db.prepare('SELECT id FROM session_runs WHERE id = ?').get(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const { setting_id, operation, purpose, power, speed, lines_per_inch, passes, focus_offset_mm } = req.body;
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM run_settings WHERE run_id = ?').get(req.params.id);

    const info = db.prepare(`
      INSERT INTO run_settings (run_id, setting_id, operation, purpose, power, speed, lines_per_inch, passes, focus_offset_mm, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(+req.params.id, setting_id || null, operation || null, purpose || null,
           power ?? null, speed ?? null, lines_per_inch ?? null, passes ?? null, focus_offset_mm ?? null,
           (maxOrder.m ?? 0) + 1);

    res.status(201).json(getRunSettings.all(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update a run setting ──────────────────────────────────────────
router.put('/:id/settings/:sid', (req, res) => {
  try {
    const rs = db.prepare('SELECT * FROM run_settings WHERE id = ? AND run_id = ?')
                 .get(req.params.sid, req.params.id);
    if (!rs) return res.status(404).json({ error: 'Not found' });

    const fields = ['setting_id','operation','purpose','power','speed','lines_per_inch','passes','focus_offset_mm','sort_order'];
    const updates = [], values = [];
    for (const f of fields) {
      if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.sid);
    db.prepare(`UPDATE run_settings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json(getRunSettings.all(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Remove a setting from run ─────────────────────────────────────
router.delete('/:id/settings/:sid', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM run_settings WHERE id = ? AND run_id = ?')
                   .run(req.params.sid, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json(getRunSettings.all(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
