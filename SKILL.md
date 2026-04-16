# SKILL.md — xTool S1 Guide Site Domain Knowledge

This file captures rules, assumptions, and patterns that are not obvious from reading
the code in isolation. A future Claude session should read this before making changes.
All sections describe the **current implemented state** unless explicitly marked as a
known gap or future plan.

---

## Upgrade roadmap

| Phase | Scope | Key change | Status |
|-------|-------|------------|--------|
| 1 | Users | Named local users; owner on projects and sessions | **Complete** |
| 2 | Settings lineage + profiles | Parent-child versioning; setting_families grouping | **Complete** |
| 3 | Session → Runs | Sessions are containers; runs are individual laser jobs | **Complete** |
| 4 | Artifacts + modifiers | Named artifact types with parameter deltas | **Complete** |
| 5 | Cleanup | Remove deprecated columns; run counts; dashboard stats | **Complete** |
| 6 | UI framework redesign | Replace vanilla CSS/JS with Bootstrap (or equivalent) | Pending |

### Known gaps (deferred, not blocking)

1. **Run observations cannot be promoted to a learning note.** Session-level observations
   have a "→ Note" promote button; run-level observations only have "Dismiss." The same
   promote flow (`POST /api/observations/:id/promote/note`) could be wired up in
   `renderRunObsSection` in `public/js/sessions.js`.

2. **Artifact picker missing from "Start a New Session" quick-start form.** The run
   form (add/edit run in the detail panel) has an artifact picker, but the quick-start
   form on the Sessions page does not pass `artifact_id` when auto-creating Run #1.

3. **`usage_log` still has legacy columns that are no longer read or written:**
   `material`, `operation`, `project_name`, `setting_id`. They were not dropped because
   `setting_id` has a FK constraint that SQLite won't allow dropping, and `operation`
   has a CHECK constraint. These columns are vestigial — ignore them. `duration_min`
   is still actively used (shown and editable in the session detail panel).

---

### Phase 6 — UI redesign notes

Prerequisites are now met (Phases 1–5 complete, data model stable). Before starting:

- Inventory every page and its features (Home, Sessions, Projects, Materials, Artifacts,
  Docs, Notes, Files, Users, Quick Reference)
- Confirm every API route is exercised and working
- Document all inter-page navigation state (`window._autoExpandProjectId`, etc.)

Bootstrap via CDN is the leading candidate (no build step, maps cleanly to existing
CSS custom-property palette). The rewrite is a full frontend replacement; the Express +
SQLite backend is unchanged. Keep or replace `public/js/app.js` router pattern — no
React/Vue/build pipeline unless explicitly decided otherwise.

---

## Domain rules and constraints

### Laser safety (hard rule — never relax)
**Never laser PVC, vinyl, or any chlorine-containing material.** This releases toxic
hydrogen chloride gas. The warning appears on: the material input in sessions.html
(tooltip), the Quick Reference page, and seed.js comments. Add the same warning to
any new material input field.

### Material setting roles
Roles flow one direction only: `candidate` → `confirmed` → `archived`. Rules:
- Every new setting starts as `candidate`.
- **Exactly one confirmed setting is allowed per `(family_id, operation)` pair.**
  Confirming a new one atomically archives the previous confirmed one via
  `db.transaction()` in `routes/settings.js PUT /:id/confirm`. Not a DB constraint —
  enforced in application logic.
- Archived settings hidden from `GET /api/settings` unless `?archived=1` is passed.
- `ORDER BY` puts confirmed first within each family+operation group:
  `CASE role WHEN 'confirmed' THEN 0 ELSE 1 END`.

### Material profiles (`setting_families`)
- `setting_families` groups settings under a named material variant (e.g. "Walnut — thin
  veneer"). Provides a stable `family_id` FK in place of free-text material strings.
- One confirmed setting per `(family_id, operation)` pair allows "confirmed for thin
  walnut" and "confirmed for thick walnut" simultaneously.
- **Setting lineage**: `material_settings.parent_id` is a self-referential FK. To improve
  a setting, create a child row pointing at the parent — do not edit the parent. The
  parent archives; the child starts as candidate. This preserves full parameter history.
- "Improve this setting" is a UI flow (not a raw edit) that pre-populates a new child row.

### Users
- `users` table holds local named identities (no passwords, no auth — local app only).
- One user can be flagged `is_default = 1`; pre-selected on all forms.
- Projects have one `owner_id` FK. Sessions (`usage_log`) have `user_id` (primary owner)
  and a `session_users` junction table for multi-user sessions.
- Deleting a user does **not** delete their projects or sessions — FK is set to NULL.
  Warn before deleting if the user owns anything.

### Session lifecycle
States: `planned → in_progress → completed | aborted`. Rules:
- `planned` sessions show setup and pre-run checklists on the Home page. "Start Laser
  Run" is gated on all pre-run items checked — enforced in JS, not the API.
- `planned` sessions have no material or operation on the session row itself; runs carry
  that data. The plan form only captures project association.
- Transitioning to `in_progress` sets `started_at = datetime('now')` on the server.
- Transitioning to `completed` or `aborted` sets `ended_at = datetime('now')`.
- No `paused` state. If a user walks away, the session stays `in_progress`.
- Only one session should be `in_progress` at a time. Not enforced by API; home page
  shows the most recent one if multiple somehow exist (`ORDER BY id DESC LIMIT 1`).

### Session vs. Run model
A **session** is a single sitting at the machine. It owns: project, user, dates,
outcome, notes, duration. It has no material or operation of its own.

A **run** is one laser job within a session. One session can contain many runs.
- Runs carry: `material`, `artifact_id`, `family_id`, `setting_id` (FK to
  material_settings for quick reference), `power_override`, `speed_override`,
  `passes_override`, `focus_override`, `file_used`, `outcome`, `notes`,
  `started_at`, `ended_at`, `run_number`.
- **Each run can have N settings** via the `run_settings` junction table. Each
  `run_settings` row has its own `operation`, `purpose`, `power`, `speed`,
  `lines_per_inch`, `passes`, `focus_offset_mm`. The setting row can also link to a
  `material_settings` row via `setting_id`; own fields override the linked row's values.
  `effective_operation` is `COALESCE(rs.operation, ms.operation)` computed in SQL.
- **Observations attach to runs** via `run_id`. `session_observations.session_id`
  is always set (auto-derived from the run's session when only `run_id` is provided).

### Artifacts and modifiers
An **artifact** is a named thing being made (coaster, box lid, pendant, sign).
It lives in the `artifacts` table with an optional `default_family_id`.
- Artifacts carry parameter deltas: `power_delta` (±%), `speed_delta` (±mm/sec),
  `focus_delta` (±mm), `passes_delta`. Applied on top of the base material setting.
- Modifier stack: base setting → artifact deltas → per-run manual overrides.
  Each layer is optional. Only deltas are stored; effective values are computed in the UI.
- The `fmtParam(runOverride, base, delta, unit)` helper in `sessions.js` annotates
  display as `base +delta→effective` in amber (`--accent2`) when a delta is present.
- `session_runs.artifact_id` FK links a run to its artifact. The run list and detail
  JOIN on `artifacts` to get `artifact_name` and all delta fields.

### Project deletion policy
Deleting a project **does not** delete its sessions. Sessions are detached:
`UPDATE usage_log SET project_id = NULL`. Usage history is preserved for stats.

### Observation retention
Dismissed observations are soft-deleted (set `dismissed_at`). Hard purge via
`DELETE /api/observations/purge` removes those older than **90 days**. Window is
hardcoded in SQL; no config.

### Focus offset for Baltic Birch
`focus_offset_mm = -2` for Baltic Birch 3/16" cutting is a **physical machine
requirement**, not a preference. Auto-focus targets material surface; lowering by 2mm
puts the focal point at mid-material depth for better cut-through. Never seed this as 0.

---

## Magic numbers

| Value | Location | Meaning |
|-------|----------|---------|
| `90` days | `routes/observations.js` DELETE /purge | Observation soft-delete retention window |
| `-2` | `db/seed.js` | Baltic Birch focus offset (mm below auto-focus) |
| `0–100` | Power field | Percentage of max laser output (not watts) |
| `mm/sec` | Speed field | All speeds are in millimetres per second |
| `3000` | `.env` PORT | Default local port |
| `5` | `public/js/projects.js` loadDetail | Sessions shown in project detail before "+ N more" |
| `4000` | `public/js/projects.js` showBanner | Success banner auto-dismiss delay in ms |
| `300` | `public/js/projects.js` loadData | setTimeout before clicking auto-expand project button |
| `300` | `public/js/sessions.js` navigate | setTimeout before setting project filter after navigation |
| `150` | `public/js/projects.js` loadData | setTimeout before scrollIntoView after auto-expand |
| `2000` | `public/js/home.js` flashCleared | "✓ Cleared" flash duration in ms |

---

## Assumptions baked into the logic

### dotenv must be first
`server.js` calls `require('dotenv').config()` as its **first line** before any other
require. `db/db.js` reads `process.env.DB_PATH` at module load time. If dotenv runs
after db.js is required, `DB_PATH` is undefined and the database opens at the wrong
path or crashes. Never reorder these requires.

### better-sqlite3 is synchronous
All database calls (`.get()`, `.all()`, `.run()`, `.exec()`) are **synchronous**. They
return values directly; there is no Promise. Never add `await` to a DB call. Never wrap
a DB call in a Promise. DB calls inside an `async` route function are still synchronous.

### FTS5 does not auto-sync
`docs_fts` is a content table (`content='docs_sections'`). SQLite does **not**
automatically update FTS indexes when the content table changes. The triggers
`docs_fts_ai`, `docs_fts_ad`, `docs_fts_au` in `schema.sql` maintain sync.
If rows are inserted into `docs_sections` outside the ORM, manually insert into
`docs_fts` as well. The triggers handle all normal cases.

### Schema migrations via try/catch in db.js
New columns are added via `ALTER TABLE` in the `MIGRATIONS` array in `db/db.js`, each
in an individual try/catch. SQLite throws if the column already exists; the catch
ignores it. This makes migrations idempotent but fragile — a typo in a column name
silently does nothing. Always verify the column exists after adding a migration.

### Sessions table is named `usage_log`
The underlying SQLite table is `usage_log`; API routes are `/api/usage/*`. This predates
the "sessions" terminology used in the UI. Do not rename without a deliberate migration.
`session_runs` is the child table (added Phase 3); `usage_log` is the parent.

### Milestones stored as JSON string
`projects.milestones` is a `TEXT` column containing a JSON object. Parse with
`JSON.parse()` before use. The JS code handles both string and already-parsed forms:
```js
typeof milestones === 'string' ? JSON.parse(milestones) : milestones
```
Do not change this to a real JSON column type — SQLite doesn't have one.

### Project files scan is flat-directory only
`routes/files.js` POST /scan uses `fs.readdirSync(dir, { withFileTypes: true })` and
filters to `e.isFile()` only. Subdirectories are not recursed — intentional for the
simple single-folder use case.

### Archived settings hidden by default
`GET /api/settings` omits archived rows unless `?archived=1` is passed. The filter bar
UI never sends `archived=1`, so users never accidentally see stale settings.

---

## Repeated patterns

### Partial update pattern (all mutation routes)
Every PUT route builds `updates[]` and `values[]` arrays dynamically:
```js
const updates = [], values = [];
if (req.body.name !== undefined) { updates.push('name = ?'); values.push(req.body.name); }
// ...
if (!updates.length) return res.json({ id }); // nothing to do
values.push(id);
db.prepare(`UPDATE t SET ${updates.join(', ')} WHERE id = ?`).run(...values);
```
Never use `req.body.field || existingValue` fallback — that silently ignores intentional
nullification.

### Route error handling
```js
try {
  // ...
} catch (e) {
  res.status(500).json({ error: e.message });
}
```
400s thrown explicitly before the try block. 404s use
`if (!row) return res.status(404).json({ error: 'Not found' })`.

### Frontend apiFetch wrapper
Every JS module defines a local `apiFetch(url, opts)` that checks `r.ok` and throws:
```js
async function apiFetch(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
```
Never call `fetch()` directly — always go through `apiFetch`.

### showBanner pattern
Every JS module has a local `showBanner(msg, type = 'error')` rendering into a
module-specific banner div. Errors are persistent. Success messages auto-dismiss after
4000ms. Never use `alert()`.

### Seed idempotency
`db/seed.js` uses `INSERT OR IGNORE` throughout. Safe to run multiple times.

### `ul.onchange =` not `ul.addEventListener`
In `home.js`, checklist change handlers use `ul.onchange = function() {...}` to prevent
listener accumulation on re-render. If you switch to `addEventListener`, you must also
call `removeEventListener` on re-render or listeners will stack.

### Inline forms instead of browser dialogs
Never use `prompt()` for data-entry flows. Use inline forms that replace the action
button area. The `obs-actions` div pattern is the reference: clicking "→ Note" replaces
the div's innerHTML with input + Save/Cancel buttons. Using `prompt()` caused a
click-through bug where the dialog's OK button triggered underlying DOM buttons.

### Cross-page navigation state via `window._` global
When navigating between pages with a specific item to highlight, the sending page sets
a `window._autoExpandProjectId` global before calling `navigate()`. The destination
page checks and clears it on load. Always clear the global after reading it — the SPA
router has no URL params or state-passing mechanism.

---

## "Why" comments (design decisions that are not obvious)

**Why detach sessions on project delete instead of cascading:**
Sessions represent real work and must be preserved for stats even if the project is
removed. Sessions become "standalone" (project_id = NULL) rather than disappearing.

**Why archive instead of delete on setting confirm:**
Archived settings preserve the full history of parameter evolution for a material+operation
pair. Hard-deleting the old confirmed setting would break that history.

**Why parent_id for setting lineage instead of a versions table:**
A self-referential FK keeps all settings in one table, makes queries simple (single JOIN),
and allows branching (two children from one parent = two experimental directions).

**Why family_id (profiles) instead of just a material text field:**
Free-text strings lead to inconsistency ("Walnut", "walnut", "Walnut 1/4"). Profiles
give each distinct material variant a stable ID. The confirm scope is per-family so you
can have "confirmed for thin walnut" and "confirmed for thick walnut" simultaneously.

**Why runs are separate rows instead of a JSON array on the session:**
Individual runs need their own outcome, observations, artifact, and timestamps. Separate
rows allow filtering, aggregation, and FK cascades (delete run → delete its observations).

**Why run_settings is a junction table (N settings per run):**
A single session can engrave then score the same piece. Those are different operations
with different parameters. N settings per run captures mixed-operation jobs correctly.

**Why artifacts carry deltas not absolute values:**
An artifact modifier expresses "this piece needs slightly more power than the base
setting." Deltas stay meaningful as the base setting evolves. Absolute values would
duplicate and diverge from the base.

**Why `confirm: true` in request body for disk deletion:**
A URL-only DELETE could be triggered accidentally (browser prefetch, mis-typed curl).
Requiring `confirm: true` in the POST body forces deliberate construction. No recycle bin.

**Why FTS5 with manual triggers instead of LIKE search:**
FTS5 supports ranked full-text search efficiently. LIKE `%term%` can't use indexes and
is slow on long document bodies. Manual triggers are a SQLite FTS5 boilerplate requirement.

**Why `window.{page}Init` instead of ES modules:**
No build step. ES module `import` requires a bundler or `<script type="module">`, which
complicates the dynamic partial-injection SPA pattern. Do not introduce `import/export`.

**Why starred doesn't mean "confirmed":**
Starred is a user bookmark ("looks interesting"); confirmed means "current production
setting." A user can star multiple candidates before confirming one. Orthogonal states.

**Why observation types use a fixed list:**
Free-form tags create synonyms ("bug" / "issue" / "problem"). The fixed list maps to
actionable workflows: notes → learning_notes, issues → investigation, questions → things
to test, discoveries → candidate settings.

**Why session checklist state is in localStorage, not the DB:**
Checklist state is ephemeral UI, not business data. The session ID is the key, so state
automatically orphans when a session completes and won't pollute future sessions.

**Why `usage_log` legacy columns weren't dropped:**
`setting_id` has an outbound FK constraint; SQLite 3.35+ DROP COLUMN cannot remove FK
columns. `operation` has a CHECK constraint (behavior uncertain across SQLite patch
versions). Safest outcome: columns sit unused. If a future migration rebuilds the table
via CREATE/INSERT/DROP/RENAME, these can be cleaned up then.

---

## CSS theme quick reference

```css
--bg:         #12121f  /* page background — darkest */
--surface:    #1c2340  /* cards, sidebar */
--surface2:   #243060  /* inline forms, secondary buttons */
--accent:     #e94560  /* red — primary CTA, active nav, progress bars */
--accent2:    #f5a623  /* orange — warnings, starred items, artifact deltas */
--text:       #f0f0f0  /* primary text — near white */
--text-muted: #9eaab4  /* secondary text — cool gray, NOT blue-purple */
--border:     #2e3560  /* subtle dividers */
--danger:     #c0392b  /* delete buttons, error states */
--success:    #27ae60  /* success states, confirmed milestones */
```

Sidebar link colors are hardcoded to `#c8ccd4` (inactive) and `#ffffff` (active/hover)
because `--text-muted` had a blue tint that rendered as purple/magenta on some displays.

---

## Parameter ranges (xTool S1 20W)

| Parameter | Range | Unit | Notes |
|-----------|-------|------|-------|
| Power | 0–100 | % of max output | Not watts |
| Speed | ~9–400+ | mm/sec | Lower = slower = more energy delivered |
| LPI | 100–500 | lines per inch | Higher = finer detail, slower scan |
| Passes | 1–5+ | count | Cutting thick material typically needs 2–3 |
| Focus offset | -5 to +5 | mm | Negative = closer to material surface |

Baltic Birch 3/16" requires `focus_offset_mm = -2` (hardcoded in seed; must not be 0).
Glass engraving: power 70–80%, speed 80–200 mm/sec, 200 LPI, 1 pass.
