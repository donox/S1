# SKILL.md — xTool S1 Guide Site Domain Knowledge

This file captures rules, assumptions, and patterns that are not obvious from reading
the code in isolation. A future Claude session should read this before making changes.

**Architecture status note:** This project is undergoing a phased upgrade. Sections
marked `[PLANNED — Phase N]` describe the target design, not yet implemented. Sections
marked `[CURRENT — changing in Phase N]` describe live behavior that will be replaced.
Unmarked sections are stable and apply now.

---

## Upgrade roadmap (high-level)

The system is evolving through five phases. Each phase leaves the app fully functional.

| Phase | Scope | Key change | Status |
|-------|-------|------------|--------|
| 1 | Users | Add named local users; owner on projects and sessions | **Complete** |
| 2 | Settings lineage + profiles | Parent-child setting versioning; material profiles as grouping unit | **Complete** |
| 3 | Session → Runs | Sessions become containers; runs are individual laser jobs | **Current** |
| 4 | Artifacts + modifiers | Named artifact types with parameter deltas | Pending |
| 5 | Cleanup | Remove deprecated columns; final stats/dashboard update | Pending |
| 6 | UI framework redesign | Replace vanilla CSS/JS frontend with Bootstrap (or equivalent) | Pending |

### Phase 6 notes — UI redesign prerequisite

Before starting Phase 6, all existing functionality must be fully documented so nothing
is lost in the rewrite. Specifically:

- Every page and its features inventoried (Home, Sessions, Projects, Materials, Docs,
  Notes, Files, Quick Reference)
- Every API route exercised and confirmed working
- All inter-page navigation state (e.g. `window._autoExpandProjectId`) documented
- Phase 5 cleanup complete so the data model is stable before the UI is rebuilt

Bootstrap via CDN is the leading candidate (no build step required, wide community
experience with responsive grid and component patterns). The current vanilla CSS
custom-property approach is intentionally Bootstrap-compatible in spirit — the colour
palette and spacing variables map cleanly to Bootstrap CSS variables.

The rewrite is a full frontend replacement. Backend (Express + SQLite routes) is
unchanged. Keep `public/js/app.js` router pattern or replace with a lightweight
equivalent — no React/Vue/build pipeline unless explicitly decided otherwise.

---

## Domain rules and constraints

### Laser safety (hard rule — never relax)
- **Never laser PVC, vinyl, or any chlorine-containing material.** This releases toxic
  hydrogen chloride gas. The warning appears in three places: the material input tooltip
  in sessions.html, the Quick Reference page, and seed.js comments. If you add any new
  material input field, add the same warning.

### Material setting roles [CURRENT — confirm scope changing in Phase 2]
Roles flow one direction only: `candidate` → `confirmed` → `archived`. There is no
going back, and no skipping steps. Rules:
- Every new setting starts as `candidate`.
- **Exactly one confirmed setting is allowed per (material, operation) pair.**
  Confirming a new one atomically archives the previous confirmed one.
  This is enforced via `db.transaction()` in `routes/settings.js PUT /:id/confirm`,
  not via a DB constraint — the constraint lives in application logic.
- Archived settings are hidden from normal GET /api/settings responses unless
  `?archived=1` is passed. This is intentional: the user wants to see only working
  settings by default.
- The ORDER BY in GET /api/settings puts confirmed first within each material+operation
  group: `CASE role WHEN 'confirmed' THEN 0 ELSE 1 END`.

### Material setting roles [PLANNED — Phase 2]
The confirm scope will change from `(material, operation)` to `(family_id, operation)`:
- **Material profiles** (`setting_families` table) group settings under a named variant
  of a material (e.g. "Walnut — thin veneer", "Walnut — thick slab").
- One confirmed setting is allowed per `(family_id, operation)` pair. This means a
  single material can have multiple confirmed settings as long as they belong to
  different profiles.
- **Setting lineage**: `material_settings.parent_id` is a self-referential FK. When
  you improve a setting, create a new child row pointing at the parent — do not edit
  the parent. The parent is archived; the child starts as candidate. This preserves
  the full history of parameter evolution.
- "Improve this setting" is a UI flow, not a raw edit. It creates a child row
  pre-populated with the parent's values for the user to modify.

### Users
- A `users` table holds local named identities (no passwords, no auth — local app).
- One user can be flagged `is_default = 1`; this user is pre-selected on all forms.
- Projects have one `owner_id` FK. The owner is the default session user for that project.
- Sessions (`usage_log`) have a `user_id` (primary session owner) and an optional
  `session_users` junction table for multi-user sessions.
- Deleting a user does **not** delete their projects or sessions — set FK to NULL
  (preserve history). Warn the user before allowing deletion if the user owns anything.

### Session lifecycle [CURRENT — structure changing in Phase 3]
States flow: `planned → in_progress → completed | aborted`. Rules:
- `planned` sessions show a setup checklist on the home page. "Start Laser Run" is
  gated on all pre-run checklist items being checked. The gate is enforced in JS,
  not the API.
- Transitioning to `in_progress` sets `started_at = datetime('now')` on the server.
- Transitioning to `completed` or `aborted` sets `ended_at = datetime('now')`.
- There is no `pending` or `paused` state. If a user walks away, the session stays
  `in_progress` until they explicitly complete or abort it.
- Only one session should be `in_progress` at a time. The home page actively checks
  for this and shows the active session card. The API does not enforce the constraint;
  if two sessions somehow become in_progress, the home page shows the most recent one
  (`ORDER BY id DESC LIMIT 1`).

### Session vs. Run model [PLANNED — Phase 3]
A **session** is a single sitting at the machine. It has no material or operation of
its own — those belong to runs.

A **run** is one laser job within a session. One session can contain many runs.
- Run lifecycle is independent of session lifecycle. A run can be `completed` while
  the session is still `in_progress` (more runs may follow).
- Runs carry: `material`, `operation`, `setting_id`, `family_id`, `power_override`,
  `speed_override`, `passes_override`, `focus_override`, `file_used`, `artifact_id`,
  `outcome`, `notes`, `started_at`, `ended_at`, `run_number`.
- **Observations attach to runs, not sessions** (Phase 3 change). An observation is
  about a specific laser job, not the sitting as a whole.
- Migration: existing `usage_log` rows with material/operation data each get one
  auto-created `session_runs` child row. The session row retains only session-level
  fields. This migration must be idempotent (`INSERT OR IGNORE` keyed on session_id
  where no run already exists).

### Artifacts and modifiers [PLANNED — Phase 4]
- An **artifact** is a named thing being made (coaster, box lid, pendant, sign).
  It lives in an `artifacts` table and can optionally have a `default_family_id`
  (the material profile most commonly used for it).
- Artifacts carry **parameter modifiers**: `power_delta` (±%), `speed_delta` (±mm/sec),
  `focus_delta` (±mm), `passes_override`. These are deltas applied on top of the
  base material setting when a run targets that artifact.
- Modifier application order: base setting → material profile overrides → artifact
  modifiers → per-run manual overrides. Each layer is optional.
- The effective (computed) parameters shown in the run UI are always the final result
  of this stack; the stored values are the deltas, not the computed values.

### Project deletion policy
Deleting a project **does not** delete its sessions. Instead, sessions are detached:
`UPDATE usage_log SET project_id = NULL`. This is intentional — usage history should
be preserved for stats even if the project is removed. The DELETE route comment says
"Sessions will be detached but not deleted."

### Observation retention
Dismissed observations are retained for exactly **90 days** before being eligible for
purge. The `DELETE /api/observations/purge` endpoint removes observations where
`dismissed_at < datetime('now', '-90 days')`. This is a soft-delete approach: dismiss
first, purge later. The 90-day window is hardcoded in the SQL; there is no config for it.

**Phase 3 note:** `session_id` on `session_observations` will become `run_id`. The
retention and soft-delete rules do not change.

### Focus offset for Baltic Birch
`focus_offset_mm = -2` for Baltic Birch 3/16" cutting is a **physical machine
requirement**, not a preference. The auto-focus sets the laser to the material surface;
for thick material cuts, lowering focus by 2mm delivers energy at mid-material depth,
improving cut-through. Never seed this as 0.

---

## Magic numbers

| Value | Location | Meaning |
|-------|----------|---------|
| `90` days | `routes/observations.js` DELETE /purge | Observation soft-delete retention window |
| `-2` | `db/seed.js` | Baltic Birch focus offset (mm below auto-focus) |
| `0–100` | Power field | Percentage of max laser output (not watts) |
| `mm/sec` | Speed field | All speeds are in millimetres per second, not percentage |
| `3000` | `.env` PORT | Default local port |
| `5` | `public/js/projects.js` loadDetail | Sessions shown in project detail preview before "+ N more" |
| `4000` | `public/js/projects.js` showBanner | Success banner auto-dismiss delay in ms |
| `300` | `public/js/projects.js` loadData | setTimeout delay (ms) before clicking auto-expand project button |
| `300` | `public/js/sessions.js` navigate | setTimeout delay (ms) before setting project filter after navigation |
| `150` | `public/js/projects.js` loadData | setTimeout delay (ms) before scrollIntoView after auto-expand |
| `2000` | `public/js/home.js` flashCleared | "✓ Cleared" flash duration in ms |

---

## Assumptions baked into the logic

### dotenv must be first
`server.js` calls `require('dotenv').config()` as its **first line** before any other
require. `db/db.js` reads `process.env.DB_PATH` at module load time. If dotenv runs
after db.js is required, `DB_PATH` is undefined and the database opens at a wrong path
or crashes. Never reorder these requires.

### better-sqlite3 is synchronous
All database calls (`db.prepare().get()`, `.all()`, `.run()`, `.exec()`) are
**synchronous**. They return values directly; there is no Promise. Never add `await`
to a DB call. Never wrap a DB call in a Promise. If a route mixes async (for future
HTTP calls, etc.) with DB, the DB portion remains synchronous within the async function.

### FTS5 does not auto-sync
`docs_fts` is a content table (`content='docs_sections'`). SQLite does **not**
automatically update FTS indexes when the content table changes. The triggers
`docs_fts_ai`, `docs_fts_ad`, `docs_fts_au` in `schema.sql` maintain the sync.
If you ever add rows to `docs_sections` without going through the ORM (e.g., direct
SQL), you must also manually insert into `docs_fts`. The triggers handle the normal case.

### Schema migrations via try/catch in db.js
New columns are added via `ALTER TABLE` statements in the `MIGRATIONS` array in
`db/db.js`, each wrapped in individual try/catch. SQLite throws if a column already
exists; the catch ignores that error. This makes migrations idempotent but fragile —
a typo in a column name silently succeeds (no error) but the column is never added.
Always verify the column exists after adding a migration.

### Sessions table is named usage_log
The underlying SQLite table for sessions is `usage_log` and all API routes are
`/api/usage/*`. This predates the "sessions" terminology used in the UI and CLAUDE.md.
Do not rename the table or routes without a deliberate migration — the name mismatch
is documented and understood. Phase 3 will add `session_runs`; it will not rename
`usage_log`.

### Milestones stored as JSON string
`projects.milestones` is a `TEXT` column containing a JSON object like
`{"design":false,"material_acquired":false,...}`. Parse it with `JSON.parse()` before
use. The schema default is a JSON string literal. The JS code defensively handles both
string and already-parsed object forms:
```js
typeof milestones === 'string' ? JSON.parse(milestones) : milestones
```
Do not change this column to a real JSON type — SQLite doesn't have one.

### Project files scan is flat-directory only
`routes/files.js` POST /scan uses `fs.readdirSync(dir, { withFileTypes: true })`
and filters to `e.isFile()` only. Subdirectories are not recursed. This is intentional
for the simple use case (one projects folder, no nested structure assumed).

### Archived settings hidden by default
GET /api/settings omits archived rows unless `?archived=1` is in the query string.
The filter bar UI never sends `archived=1`, so users never accidentally see stale
settings. The intent is that archived = "historical record only."

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
This allows partial PATCH-style updates via PUT without listing every field explicitly.
Never use `req.body.field || existingValue` fallback — that would silently ignore
intentional nullification.

### Route error handling
Every route handler uses try/catch returning `{ error: e.message }` with status 500:
```js
try {
  // ...
} catch (e) {
  res.status(500).json({ error: e.message });
}
```
400s are thrown explicitly before the try block (missing required fields, invalid IDs).
404s use `if (!row) return res.status(404).json({ error: 'Not found' })`.

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
All errors propagate to catch blocks that call `showBanner(e.message)`. Never call
`fetch()` directly in a module — always go through `apiFetch`.

### showBanner pattern
Every JS module has a local `showBanner(msg, type = 'error')` that renders into a
module-specific banner div. Errors are persistent (user must see them). Success
messages auto-dismiss after 4000ms. Never use `alert()`.

### Seed idempotency
`db/seed.js` uses `INSERT OR IGNORE` throughout. Safe to run multiple times. The
`UNIQUE` constraints on material_settings prevent duplicates. Running seed again
after data entry does not overwrite user data.

### `ul.onchange =` not `ul.addEventListener`
In `home.js`, checklist change handlers use `ul.onchange = function() {...}` rather
than `ul.addEventListener('change', ...)`. This is intentional: assigning `onchange`
replaces any prior handler, preventing listener accumulation when the home page
re-renders. If you switch to `addEventListener`, you must also call
`ul.removeEventListener` on re-render or listeners will stack.

### Inline forms instead of browser dialogs
Never use `prompt()` or `confirm()` for data-entry flows. Use inline forms that
replace the action button area. The `obs-actions` div pattern in the observation list
is the reference implementation: clicking "→ Note" replaces the div's innerHTML with
a text input + Save/Cancel buttons. Using `prompt()` caused a click-through bug where
the dialog's OK button triggered underlying DOM buttons.

### Cross-page navigation state via `window._` global
When navigating from one page to another with a specific item to highlight (e.g.,
home page project card → projects page auto-expand), the sending page sets a
`window._autoExpandProjectId` global before calling `navigate()`. The destination
page checks and clears it on load. This is intentional: the SPA router has no URL
params or state-passing mechanism. Always clear the global after reading it.

### Phase 3 migration pattern [PLANNED]
When Phase 3 ships, a one-time migration runs at startup (in the MIGRATIONS array):
for every `usage_log` row that has `material IS NOT NULL` and no child row in
`session_runs`, insert one run row with `run_number = 1` and the session's
material/operation/setting_id/file_used/outcome data. Keyed with INSERT OR IGNORE
on `(session_id, run_number)` to be idempotent.

---

## "Why" comments (design decisions that are not obvious)

**Why detach sessions on project delete instead of cascading:**
Sessions represent real work done and should be preserved for usage statistics even
if the parent project is removed. Cascading deletes would silently destroy historical
data. Sessions become "standalone" (project_id = NULL) rather than disappearing.

**Why archive instead of delete on setting confirm:**
Users need to trace what settings they previously tried. Archived settings provide
a complete history of parameter evolution for a material+operation pair. Hard-deleting
the old confirmed setting would break that history.

**Why parent_id for setting lineage instead of a versions table [PLANNED Phase 2]:**
A self-referential FK on `material_settings` keeps all settings in one table, makes
queries simple (single JOIN), and doesn't require a separate version entity. The
lineage is a chain: grandparent → parent → child. Any node can be the root (parent_id
NULL). This also allows branching (two children from one parent = two experimental
directions).

**Why family_id (profiles) instead of just a material text field [PLANNED Phase 2]:**
Free-text material strings lead to inconsistency ("Walnut", "walnut", "Walnut 1/4").
Profiles give each distinct material variant a stable ID and a human name. The confirm
scope moves to family_id so you can have "confirmed for thin walnut" and "confirmed
for thick walnut" simultaneously.

**Why runs are separate rows instead of a JSON array on the session [PLANNED Phase 3]:**
Individual runs need their own outcome, observations, artifact, and timestamps. JSON
arrays in SQLite can't be queried per-element efficiently. Separate rows allow filtering
("show me all runs where material = Cherry"), aggregation (success rate per material),
and foreign key cascades (delete run → delete its observations).

**Why artifacts carry deltas not absolute values [PLANNED Phase 4]:**
An artifact modifier expresses "this artifact type needs slightly more power than the
base setting." Storing absolute values would duplicate and diverge from the base
setting. Deltas stay meaningful even as the base setting evolves. The UI computes and
displays the effective values; only the deltas are stored.

**Why `confirm: true` in request body for disk deletion:**
A URL-only DELETE endpoint could be triggered accidentally (e.g., by a browser
prefetch or a mis-typed curl command). Requiring `confirm: true` in the POST body
forces the client to explicitly construct the request body, preventing accidents.
The file is gone forever; there is no recycle bin.

**Why FTS5 with manual triggers instead of LIKE search:**
FTS5 supports ranked full-text search across body text efficiently. LIKE search would
require `%term%` which can't use indexes and is slow on long document bodies. The
manual trigger pattern is boilerplate SQLite FTS5 requirement, not a design choice.

**Why `window.{page}Init` instead of ES modules:**
No build step. ES module `import` requires either a bundler or `<script type="module">`,
which complicates the dynamic partial-injection SPA pattern. Global function names on
`window` are ugly but work without any tooling. Do not introduce `import/export` syntax.

**Why starred doesn't mean "confirmed":**
Starred is a user bookmark ("this one looks interesting"), while confirmed means
"this is the current production setting for this material." A user can star multiple
candidate settings to shortlist them before confirming one. They are orthogonal states.

**Why observation types use a fixed list (note/discovery/issue/question):**
Free-form tags lead to synonyms and inconsistency ("bug" vs "issue" vs "problem").
The fixed list maps to actionable workflows: notes → learning_notes, issues → future
investigation, questions → things to test, discoveries → candidate settings.

**Why session checklist state is in localStorage, not the DB:**
The checklist is ephemeral UI state, not business data. A user checking "ventilation
on" shouldn't create a database write for every checkbox. The session ID is the key,
so checklist state automatically orphans when a session is completed and won't
pollute future sessions. localStorage is cleared by the browser on its own schedule
(not by the app), which is acceptable for transient safety reminders.

---

## CSS theme quick reference

```css
--bg:         #12121f  /* page background — darkest */
--surface:    #1c2340  /* cards, sidebar */
--surface2:   #243060  /* inline forms, secondary buttons */
--accent:     #e94560  /* red — primary CTA, active nav, progress bars */
--accent2:    #f5a623  /* orange — warnings, starred items, badges */
--text:       #f0f0f0  /* primary text — near white */
--text-muted: #9eaab4  /* secondary text — cool gray, NOT blue-purple */
--border:     #2e3560  /* subtle dividers */
--danger:     #c0392b  /* delete buttons, error states */
--success:    #27ae60  /* success states, confirmed milestones */
```

Sidebar link colors are hardcoded to `#c8ccd4` (inactive) and `#ffffff` (active/hover)
because `--text-muted` had a blue tint that made sidebar text read as purple/magenta
on some displays.

---

## Parameter ranges (xTool S1 20W)

| Parameter | Range | Unit | Notes |
|-----------|-------|------|-------|
| Power | 0–100 | % of max output | Not watts |
| Speed | ~9–400+ | mm/sec | Lower = slower = more energy |
| LPI | 100–500 | lines per inch | Higher = finer detail, slower |
| Passes | 1–5+ | count | Cutting thick material needs 2–3 |
| Focus offset | -5 to +5 | mm | Negative = closer to material |

Baltic Birch 3/16" needs focus_offset = -2 (hardcoded in seed, must not be changed).
Glass engraving: power 70–80%, speed 80–200 mm/sec, 200 LPI, 1 pass.
