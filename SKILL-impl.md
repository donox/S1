# SKILL-impl.md — Implementation Patterns and Assumptions

This file covers **how the system is currently built**. It is expected to change
significantly during Phase 6 (UI framework redesign). When Phase 6 is complete,
rewrite the frontend sections to reflect the new conventions. The backend sections
(Express routes, SQLite patterns) are stable unless the backend is also refactored.

For business rules and domain knowledge that survive any code change, see
`SKILL-domain.md`.

---

## Critical backend assumptions

These are "if you get this wrong, nothing works" facts. They apply to every backend
change regardless of what else is being modified.

### dotenv must load first

`server.js` calls `require('dotenv').config()` as its **absolute first line**, before
any other `require`. The reason: `db/db.js` reads `process.env.DB_PATH` at module load
time. If `dotenv` has not yet run when `db.js` is required, `DB_PATH` is `undefined`
and the database either opens at the wrong path or crashes entirely. Never reorder
the requires in `server.js`.

### better-sqlite3 is synchronous

`better-sqlite3` uses a synchronous API by design. All calls — `.get()`, `.all()`,
`.run()`, `.exec()` — return values directly; they do not return Promises. **Never add
`await` to a database call.** This is a common mistake when mixing async route handlers
with DB calls. The DB call inside an `async` function is still synchronous.

This is intentional in the library: SQLite operations are fast enough for local use
that async overhead is not justified, and the synchronous API eliminates an entire
class of callback/promise bugs.

### FTS5 does not auto-sync

`docs_fts` is a content-table FTS5 index (`content='docs_sections'`). SQLite content
tables are **not** automatically updated when the underlying table changes. The triggers
`docs_fts_ai`, `docs_fts_ad`, `docs_fts_au` in `schema.sql` maintain the sync. If you
ever insert rows into `docs_sections` directly (bypassing the ORM — e.g. in a migration
script), you must also manually insert into `docs_fts`. The triggers handle all normal
application inserts/updates/deletes.

### Schema migrations via try/catch in db.js

New columns are added via `ALTER TABLE` statements in the `MIGRATIONS` array in
`db/db.js`. Each migration is wrapped in its own `try/catch`. SQLite throws if the
column already exists; the catch ignores that error. This makes the migration array
idempotent — safe to re-run on every server restart.

The fragility: a typo in a column name silently succeeds (the catch eats the error) but
the column is never added. Always verify the column exists after adding a migration,
either by inspecting the DB or by querying `PRAGMA table_info(tablename)`.

### Sessions table is named `usage_log`

The underlying SQLite table for sessions is `usage_log`; all API routes are
`/api/usage/*`. This naming predates the "sessions" UI terminology introduced in
later phases. The mismatch is intentional and documented — do not rename the table
or routes without a deliberate migration that touches all references.

### `usage_log` has vestigial legacy columns

The columns `material`, `operation`, `project_name`, and `setting_id` on `usage_log`
are no longer read or written by any route. They were the pre-Phase-3 shortcut fields,
superseded by `session_runs` and `run_settings`. They were not dropped because:
- `setting_id` has an outbound FK constraint — SQLite 3.35+ cannot drop FK columns.
- `operation` has a CHECK constraint — behaviour across SQLite patch versions is uncertain.

Treat them as vestigial. If a future migration rebuilds `usage_log` via
CREATE/INSERT/DROP/RENAME, they can be cleaned up then. `duration_min` is *not*
vestigial — it is still shown and editable in the session detail panel.

### Milestones stored as a JSON string

`projects.milestones` is a `TEXT` column containing a JSON object. SQLite has no native
JSON column type. Always parse with `JSON.parse()` before use. The JS code defensively
handles both string and already-parsed forms:
```js
typeof milestones === 'string' ? JSON.parse(milestones) : milestones
```

### Project files scan is flat-directory only

`routes/files.js` POST /scan uses `fs.readdirSync(dir, { withFileTypes: true })` and
filters to `e.isFile()` only. Subdirectories are not recursed. This is intentional —
the use case assumes a single flat project folder.

### Archived settings hidden by default

`GET /api/settings` omits `role = 'archived'` rows unless `?archived=1` is passed.
The filter bar UI never sends this parameter, so users never accidentally see stale
settings. Archived = historical record only.

---

## API route patterns

### Partial update (every PUT route)

All PUT routes build the `UPDATE` statement dynamically from only the fields present
in the request body. This allows partial PATCH-style updates via PUT:

```js
const fields = ['name', 'notes', 'status']; // whitelist of updatable columns
const updates = [], values = [];
for (const f of fields) {
  if (f in req.body) { updates.push(`${f} = ?`); values.push(req.body[f]); }
}
if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
values.push(id);
db.prepare(`UPDATE t SET ${updates.join(', ')} WHERE id = ?`).run(...values);
```

**Never** use `req.body.field || existingValue` as a fallback. That pattern silently
ignores intentional nullification (a client sending `null` to clear a field would have
no effect).

### Error handling

Every route handler uses try/catch with a consistent response shape:
```js
try {
  // ...
} catch (e) {
  res.status(500).json({ error: e.message });
}
```
- **400:** thrown explicitly *before* the try block for missing required fields or
  invalid input (e.g. `if (!job_date) return res.status(400).json({ error: '...' })`).
- **404:** `if (!row) return res.status(404).json({ error: 'Not found' })`.
- **500:** caught exceptions only — never used for validation errors.

### Route file structure

Each route file exports an Express `Router` instance. `server.js` mounts them:
```js
app.use('/api/usage',     require('./routes/usage'));
app.use('/api/runs',      require('./routes/runs'));
// etc.
```
Never open a second `Database` instance inside a route file. Always import the singleton
from `db/db.js`.

---

## Frontend patterns

These patterns apply to the current vanilla JS + partial-HTML SPA. Most will change
in Phase 6.

### SPA routing (`public/js/app.js`)

`public/index.html` is a single-page shell. `app.js` handles all routing:
1. Intercepts sidebar link clicks, calls `navigate(page)`.
2. `navigate()` fetches the page's HTML partial from `/pages/`, injects it into
   `<main id="content">`, then calls `window.{page}Init()` if defined.
3. `loadedModules` object prevents double-loading `<script>` tags on repeated visits.

Each `public/js/*.js` module attaches exactly one `window.{page}Init` global function.
This is the contract between the router and the page module. **Do not use ES module
`import/export` syntax** — there is no build step. The global pattern is intentional.

### `apiFetch` wrapper

Every JS module defines a local `apiFetch(url, opts)` rather than calling `fetch()`
directly. This ensures consistent error handling:
```js
async function apiFetch(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
```
All errors propagate to catch blocks that call `showBanner(e.message)`.

### `showBanner` pattern

Every module has a local `showBanner(msg, type = 'error')` that renders into a
module-specific banner `<div>`. Never use `alert()` or `confirm()` for errors.
Success messages auto-dismiss after 4000ms; error messages are persistent.

### Inline forms instead of browser dialogs

Never use `prompt()` for data-entry flows. Use inline forms that replace the action
button area in place. The `obs-actions` div in the observation list is the reference
implementation: clicking "→ Note" replaces the div's innerHTML with a text input and
Save/Cancel buttons. Using `prompt()` previously caused a bug where the dialog's OK
button triggered underlying DOM buttons.

### Cross-page navigation state via `window._` globals

When navigating from one page to another with a specific item to pre-select or expand,
the sending page sets a `window._` global before calling `navigate()`. The destination
page checks and clears it on load:
```js
// sender (home.js):
window._autoExpandProjectId = p.id;
navigate('projects');

// receiver (projects.js):
const expandId = window._autoExpandProjectId;
delete window._autoExpandProjectId;
if (expandId) { /* expand that project */ }
```
Always clear the global after reading it. The SPA router has no URL params or
state-passing mechanism of its own; this is the intentional workaround.

### Checklist event handlers: `onchange` not `addEventListener`

In `home.js`, checklist change handlers use `ul.onchange = function() {...}` rather than
`ul.addEventListener('change', ...)`. Assigning to `onchange` replaces any prior handler,
preventing listener accumulation when the home page re-renders the checklist. If you
switch to `addEventListener`, you must also call `removeEventListener` on re-render, or
handlers will stack and fire multiple times per event.

### `fmtParam` helper (sessions.js)

`fmtParam(runOverride, base, delta, unit)` in `sessions.js` computes and annotates
parameter display for run settings:
- If a per-run override exists: show it in bold.
- If base exists and delta is non-zero: show `base +delta→effective` in amber (`--accent2`).
- Otherwise: show base plain.

This is the visual representation of the artifact modifier stack described in
`SKILL-domain.md`.

---

## Magic numbers

These are hardcoded values that appear in specific files. The file/location column
will become stale after Phase 6 — update this table when refactoring.

| Value | File / location | Meaning |
|-------|----------------|---------|
| `90` days | `routes/observations.js` DELETE /purge | Observation soft-delete retention window |
| `-2` | `db/seed.js` | Baltic Birch focus offset (mm below auto-focus) — physical constant |
| `3000` | `.env` PORT | Default local port |
| `5` | `public/js/projects.js` `loadDetail` | Sessions shown in project detail before "+ N more" |
| `4000` | `public/js/projects.js` `showBanner` | Success banner auto-dismiss delay (ms) |
| `300` | `public/js/projects.js` `loadData` | Delay before clicking auto-expand button (ms) |
| `300` | `public/js/sessions.js` `navigate` | Delay before setting project filter after navigation (ms) |
| `150` | `public/js/projects.js` `loadData` | Delay before scrollIntoView after auto-expand (ms) |
| `2000` | `public/js/home.js` `flashCleared` | "✓ Cleared" flash duration (ms) |

---

## CSS theme quick reference

**This section will be replaced entirely in Phase 6.** It documents the current
custom-property palette, which is the foundation the Bootstrap migration will map to.

```css
--bg:         #12121f  /* page background — darkest */
--surface:    #1c2340  /* cards, sidebar */
--surface2:   #243060  /* inline forms, secondary buttons */
--accent:     #e94560  /* red — primary CTA, active nav, progress bars */
--accent2:    #f5a623  /* orange — warnings, starred items, artifact deltas */
--text:       #f0f0f0  /* primary text — near white */
--text-muted: #9eaab4  /* secondary text — cool gray */
--border:     #2e3560  /* subtle dividers */
--danger:     #c0392b  /* delete buttons, error states */
--success:    #27ae60  /* success states, confirmed milestones */
```

Sidebar link colors are hardcoded to `#c8ccd4` (inactive) and `#ffffff` (active/hover)
rather than using `--text-muted`, because `--text-muted` had a blue tint that rendered
as purple/magenta on some displays.

---

## Implementation "why"s

These explain current code choices. Some will become obsolete after Phase 6.

**Why `window.{page}Init` instead of ES modules:**
There is no build step. ES module `import` requires either a bundler or
`<script type="module">`, which complicates the dynamic partial-injection SPA pattern
(you cannot dynamically inject `type="module"` scripts the same way). The global
function pattern is intentional and should not be "fixed" without also introducing a
build step or changing the routing architecture.

**Why FTS5 with explicit triggers instead of LIKE search:**
FTS5 provides ranked full-text search that can use an index. A `LIKE '%term%'` query
cannot use any index and degrades linearly with document size. The trigger boilerplate
(`docs_fts_ai`, `docs_fts_ad`, `docs_fts_au`) is a SQLite FTS5 requirement for
content tables — it is not a design choice, it is mandatory for the index to stay in sync.

**Why `confirm: true` in the request body for disk deletion:**
A URL-only `DELETE /api/files/:id/delete-file` could be triggered by a browser prefetch,
an accidentally typed curl command, or a UI bug that fires the wrong request. Requiring
`{ "confirm": true }` in the POST body forces the client to deliberately construct the
request — you cannot accidentally send it. The file is permanently deleted; there is no
recycle bin.

**Why the `confirmed` constraint is in application code, not a DB constraint:**
SQLite does not support partial unique indexes (unique within a filtered subset of rows).
The rule "at most one `confirmed` per `(family_id, operation)` pair" cannot be expressed
as a `UNIQUE` constraint because it only applies to `role = 'confirmed'` rows. A
`db.transaction()` in the route is the correct implementation: it is explicit, readable,
and testable, at the cost of being slightly weaker than a true DB constraint.

**Why the legacy `usage_log` columns were not dropped:**
`setting_id` carries an outbound FK constraint (`REFERENCES material_settings(id)`).
SQLite 3.35+ DROP COLUMN explicitly prohibits dropping columns involved in FK
constraints. `operation` has a CHECK constraint whose DROP COLUMN behaviour varies
across SQLite patch versions. The safe outcome is to leave them in place as vestigial
columns rather than risk a failed migration on a production database.

**Why inline forms over browser `prompt()` dialogs:**
A browser `prompt()` is a modal dialog. When the user clicks OK in a `prompt()`, the
browser's mouseup event is dispatched to whatever element is under the cursor at that
moment — which may be a button in the underlying page. This caused a real bug where
confirming a promote-to-note action also triggered a delete button. Inline forms
eliminate the problem entirely because there is no modal dismissal event.
