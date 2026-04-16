# CLAUDE.md — xTool S1 Local Guide Site

This file is the authoritative project reference for Claude Code.
Read it fully before making any changes.

**Also read `SKILL.md`** before making any changes. It captures domain rules,
magic numbers, architecture assumptions, and repeated patterns that are not
obvious from the code. CLAUDE.md describes *what* is built; SKILL.md explains *why*.

---

## Project overview

A locally-hosted web application that serves as an interactive guide,
settings database, usage tracker, and project file manager for the
xTool S1 20W diode laser engraver. Runs at `http://localhost:3000`.
No cloud dependencies. All data stays local.

---

## Tech stack

| Layer      | Choice                  | Reason                                      |
|------------|-------------------------|---------------------------------------------|
| Runtime    | Node.js (LTS)           | Cross-platform, fast enough for local use   |
| Server     | Express 4.x             | Minimal, well-known                         |
| Database   | SQLite via `better-sqlite3` | Synchronous API, single file, no server |
| Frontend   | Vanilla JS + HTML/CSS   | No build step, easy to maintain             |
| Templating | None — static HTML + fetch | Pages load shell, JS fetches JSON from API |
| Version control | Git → GitHub       | Standard; `.env` and `data/` are gitignored |

Do **not** introduce React, Vue, Webpack, TypeScript, or any build pipeline
unless explicitly instructed. Keep the frontend dependency-free.

### Pinned npm dependencies (`package.json`)

```json
{
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.18.3"
  }
}
```

Use these exact version ranges. Do not upgrade without explicit instruction.

---

## Repository structure

```
Engraving/
├── CLAUDE.md                  ← this file
├── SKILL.md                   ← domain rules, magic numbers, patterns (read this too)
├── .env                       ← local config (gitignored)
├── .env.example               ← committed template
├── .gitignore
├── package.json
├── server.js                  ← Express entry point
├── db/
│   ├── schema.sql             ← source-of-truth DDL
│   ├── seed.js                ← one-time data import script
│   └── db.js                  ← better-sqlite3 singleton + MIGRATIONS array
├── routes/
│   ├── projects.js            ← /api/projects/*
│   ├── sessions.js            ← /api/sessions/*
│   ├── observations.js        ← /api/observations/*
│   ├── settings.js            ← /api/settings/*
│   ├── docs.js                ← /api/docs/*
│   ├── notes.js               ← /api/notes/*
│   └── files.js               ← /api/files/*
├── public/
│   ├── index.html             ← shell with sidebar nav
│   ├── css/
│   │   └── main.css
│   ├── js/
│   │   ├── app.js             ← router / nav logic
│   │   ├── home.js            ← dashboard: active session, checklists, nav cards
│   │   ├── sessions.js        ← session lifecycle + past sessions table
│   │   ├── projects.js        ← project CRUD + milestone tracking
│   │   ├── settings.js        ← material settings (candidate/confirmed/archived)
│   │   ├── docs.js
│   │   ├── notes.js
│   │   └── files.js
│   └── pages/
│       ├── home.html          ← dashboard partial
│       ├── sessions.html      ← sessions partial
│       ├── projects.html      ← projects partial
│       ├── settings.html
│       ├── docs.html
│       ├── notes.html
│       ├── files.html
│       └── reference.html
└── data/                      ← gitignored; created at first run
    ├── xtool.db               ← SQLite database file
    └── projects/              ← scanned for laser project files
```

---

## Environment variables (`.env`)

```
PORT=3000
DB_PATH=./data/xtool.db
PROJECTS_DIR=./data/projects
```

`.env.example` must always be kept in sync with `.env`. Never commit `.env`.

---

## Database layer

### `db/db.js` — singleton

`db.js` opens the SQLite database, applies the schema, then runs idempotent
`ALTER TABLE` migrations at startup. Each migration is in a `MIGRATIONS` array
wrapped in individual `try/catch` — SQLite throws if a column already exists;
the catch ignores that. This makes migrations safe to re-run on every restart.

`better-sqlite3` is **synchronous** — never `await` its calls. Always import
this module; never open a second `Database` instance in a route file.

### `db/schema.sql` — source-of-truth DDL

Schema lives in `db/schema.sql`. Always update this file when adding or
altering tables. The singleton executes it at every startup using
`PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON`.

### Tables

**`material_settings`**
Stores laser parameters. Each row is one tested combination.
The `role` column was added via migration (not in original schema DDL).
```sql
CREATE TABLE IF NOT EXISTS material_settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  material        TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK(operation IN ('engrave','score','cut')),
  power           INTEGER,               -- 0–100 %
  speed           INTEGER,               -- mm/sec
  lines_per_inch  INTEGER,
  passes          INTEGER DEFAULT 1,
  focus_offset_mm REAL DEFAULT 0,        -- e.g. -2 for Baltic Birch cut
  notes           TEXT,
  starred         INTEGER DEFAULT 0,     -- 1 = user bookmark (≠ confirmed)
  role            TEXT DEFAULT 'candidate'
                    CHECK(role IN ('candidate','confirmed','archived')),
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
```
Role rules: exactly one `confirmed` per (material, operation) pair; confirming a
new one atomically archives the previous. `archived` hidden from default GET.

**`projects`**
One row per laser project (multi-session endeavour).
```sql
CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  status       TEXT DEFAULT 'active'
                 CHECK(status IN ('active','paused','complete','abandoned')),
  goal         TEXT,
  milestones   TEXT DEFAULT '{"design":false,"material_acquired":false,
                              "test_run":false,"production":false,
                              "finishing":false,"documented":false}',
  outcome      TEXT,
  completed_at TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);
```
`milestones` is a JSON string — always parse with `JSON.parse()` before use.

**`usage_log`** (sessions)
One row per laser session. Several columns were added via migration.
```sql
CREATE TABLE IF NOT EXISTS usage_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_date     TEXT NOT NULL,        -- ISO date YYYY-MM-DD
  material     TEXT,
  operation    TEXT CHECK(operation IN ('engrave','score','cut','mixed')),
  project_name TEXT,                 -- legacy free-text; prefer project_id
  duration_min INTEGER,
  file_used    TEXT,
  setting_id   INTEGER REFERENCES material_settings(id),
  outcome      TEXT CHECK(outcome IN ('success','partial','failed')),
  notes        TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  -- added via migration:
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  session_type TEXT DEFAULT 'laser',
  status       TEXT DEFAULT 'planned'
                 CHECK(status IN ('planned','in_progress','completed','aborted')),
  started_at   TEXT,
  ended_at     TEXT
);
```

**`session_observations`**
Captures discoveries, issues, and notes during or after a session.
```sql
CREATE TABLE IF NOT EXISTS session_observations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES usage_log(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK(type IN ('note','discovery','issue','question')),
  content      TEXT NOT NULL,
  dismissed_at TEXT,
  promoted_to  TEXT,               -- 'note' | 'setting' when promoted
  created_at   TEXT DEFAULT (datetime('now'))
);
```
Dismissed observations are soft-deleted; `DELETE /api/observations/purge` removes
those older than 90 days.

**`docs_sections`**
Parsed manual content, searchable by full-text.
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts
  USING fts5(section, title, body, content='docs_sections', content_rowid='id');

CREATE TABLE IF NOT EXISTS docs_sections (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  section  TEXT NOT NULL,   -- top-level category e.g. "Techniques"
  title    TEXT NOT NULL,   -- subsection heading
  body     TEXT NOT NULL,   -- plain text content
  tags     TEXT             -- comma-separated: "engraving,wood,paint"
);
```

**FTS5 sync triggers** — `docs_fts` is a content table (`content='docs_sections'`).
SQLite does **not** auto-sync it; you must maintain it with explicit triggers:

```sql
CREATE TRIGGER IF NOT EXISTS docs_fts_ai AFTER INSERT ON docs_sections BEGIN
  INSERT INTO docs_fts(rowid, section, title, body) VALUES (new.id, new.section, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS docs_fts_ad AFTER DELETE ON docs_sections BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, section, title, body) VALUES ('delete', old.id, old.section, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS docs_fts_au AFTER UPDATE ON docs_sections BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, section, title, body) VALUES ('delete', old.id, old.section, old.title, old.body);
  INSERT INTO docs_fts(rowid, section, title, body) VALUES (new.id, new.section, new.title, new.body);
END;
```

These triggers must live in `schema.sql` so the singleton applies them at startup.

**`learning_notes`**
User notes, tips, and quiz items.
```sql
CREATE TABLE IF NOT EXISTS learning_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  topic      TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT DEFAULT 'note'
               CHECK(status IN ('note','learned','question','try')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**`project_files`**
Index of scanned files from `PROJECTS_DIR`. Rebuilt on demand, not on
every request.
```sql
CREATE TABLE IF NOT EXISTS project_files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT NOT NULL,
  filepath     TEXT NOT NULL UNIQUE,
  ext          TEXT,                  -- svg, lbrn, xcs, png, etc.
  size_bytes   INTEGER,
  tag          TEXT DEFAULT 'keep'
                 CHECK(tag IN ('keep','review','delete')),
  notes        TEXT,
  last_scanned TEXT DEFAULT (datetime('now'))
);
```

---

## Seed data (from User_Manual.odt)

`db/seed.js` must be idempotent — safe to run multiple times.
Use `INSERT OR IGNORE` throughout. Run with `node db/seed.js`.

### Material settings to seed

#### Engraving — Wood

| Material  | Power | Speed | LPI | Passes | Notes                                      |
|-----------|-------|-------|-----|--------|--------------------------------------------|
| Walnut    | 80    | 300   | 200 | 1      | Crisp, but a bit light                     |
| Walnut    | 70    | 200   | 200 | 1      | Some burn flaring, deep cuts               |
| Walnut    | 25    | 200   | 300 | 1      | Cleanest, best overall ★                   |
| Cherry    | 30    | 200   | 200 | 1      | Clearest, but a bit light                  |
| Cherry    | 40    | 200   | 200 | 1      | Clear, slightly light                      |
| Cherry    | 80    | 300   | 200 | 1      | Good, slight burn flaring                  |
| Cherry    | 55    | 200   | 200 | 1      | Strong, some difficulty with fine lines    |
| Red Oak   | 55    | 200   | 200 | 1      | Slightly light, good clarity               |
| Red Oak   | 80    | 300   | 200 | 1      | Clearer, very slightly lighter             |
| Red Oak   | 60    | 300   | 300 | 1      | Possibly best overall ★                    |
| Oak       | 40    | 200   | 200 | 1      | Clearest, a bit light                      |
| Oak       | 90    | 340   | 260 | 1      | Dark, some lack of separation fine lines   |
| Oak       | 60    | 200   | 200 | 1      | Good, very slight burn flaring             |

#### Engraving — Glass

Speed 80–200 (140 performs well). Power 70–80 (lean toward 70).
1 pass, 200 LPI.

Seed as: power=70, speed=140, lpi=200, passes=1, notes="Speed range 80-200; power range 70-80. 200 LPI."

#### Cutting

| Material            | Power | Speed | Passes | Notes                    |
|---------------------|-------|-------|--------|--------------------------|
| Baltic Birch 3/16"  | 100   | 9     | 2      | Lower laser focus by 2mm |
| Black Acrylic 1/8"  | 100   | 10    | 3      |                          |

Set `focus_offset_mm = -2` for Baltic Birch.

### Docs sections to seed

Import these sections from the manual into `docs_sections`:

| section            | title                        | tags                          |
|--------------------|------------------------------|-------------------------------|
| Overview           | Key Features                 | overview,autofocus,software   |
| Modes              | Cutting                      | cutting,operation             |
| Modes              | Scoring                      | scoring,operation             |
| Modes              | Engraving                    | engraving,operation           |
| Modes              | Choosing Between Scoring and Engraving | scoring,engraving |
| Operating Params   | EasySet & Material Testing   | settings,testing,xcs          |
| Safety             | Safety Considerations        | safety,ventilation            |
| Techniques         | Inlay Painting               | painting,finishing,technique  |
| Techniques         | AI to Laser-Ready Vector     | ai,gimp,inkscape,workflow     |
| File Management    | File Naming Convention       | files,organization            |

---

## API routes

All routes return JSON. All mutation routes (`POST`, `PUT`, `DELETE`)
expect `Content-Type: application/json`.

### Projects — `routes/projects.js`

```
GET    /api/projects                 list all; ?status=
GET    /api/projects/:id             single project with embedded sessions array
POST   /api/projects                 create
PUT    /api/projects/:id             update (partial OK); status→complete sets completed_at
DELETE /api/projects/:id             detaches sessions (sets project_id=NULL), does not delete them
```

### Sessions — `routes/usage.js` (mounted at `/api/usage`)

Sessions are the top-level container for a laser work period. Individual jobs within
a session are runs (`session_runs`). The `GET /:id` response embeds a `runs[]` array.

```
GET    /api/usage                    list; ?status=&outcome=&project_id=&from=&to=
GET    /api/usage/:id                single session with embedded runs[] and participants[]
POST   /api/usage/start              create in_progress session; auto-creates run #1 if
                                     material provided; body: project_id, material,
                                     operation, setting_id, file_used, user_id
POST   /api/usage                    create session (any status); body: job_date required
PUT    /api/usage/:id                update (partial OK)
PUT    /api/usage/:id/begin          planned → in_progress; sets started_at
PUT    /api/usage/:id/complete       sets status=completed, ended_at; body: outcome, notes,
                                     duration_min
PUT    /api/usage/:id/abort          sets status=aborted, ended_at
DELETE /api/usage/:id                hard delete
```

### Runs — `routes/runs.js`

Sessions are containers; each laser job within a session is a run.

```
GET    /api/runs                        list runs for a session; ?session_id= (required)
                                        each run includes a settings[] array
GET    /api/runs/:id                    single run with settings[] and observations[]
POST   /api/runs                        create run (auto-assigns run_number); body: session_id,
                                        material, file_used, outcome, notes
PUT    /api/runs/:id                    update run (partial OK): material, file_used,
                                        outcome, notes, started_at, ended_at
DELETE /api/runs/:id                    hard delete (cascades to run_settings and observations)

POST   /api/runs/:id/settings           add a setting to a run; body: setting_id (optional FK
                                        to material_settings), operation, purpose, power, speed,
                                        lines_per_inch, passes, focus_offset_mm; returns full
                                        updated settings[] for the run
PUT    /api/runs/:id/settings/:sid      update a run setting (partial OK); same fields as POST;
                                        returns full updated settings[] for the run
DELETE /api/runs/:id/settings/:sid      remove a setting from a run; returns updated settings[]
```

`run_settings` rows can link to a saved `material_settings` row via `setting_id` (params
are inherited from the linked setting and shown via JOIN aliases `setting_power`,
`setting_speed`, etc.) or store params directly for ad-hoc values. Own fields
(`power`, `speed`, etc.) override the linked setting's values when both are present.
The API returns `effective_operation` (COALESCE of own `operation` and linked setting's).

### Observations — `routes/observations.js`

```
GET    /api/observations             list; ?session_id=&run_id=&type=&dismissed=
POST   /api/observations             create; requires session_id or run_id (session_id
                                     auto-derived from run when only run_id provided)
PUT    /api/observations/:id/dismiss soft-delete: sets dismissed_at
POST   /api/observations/:id/promote/note  → creates learning_note, dismisses observation
DELETE /api/observations/purge       removes dismissed observations older than 90 days
```

### Settings — `routes/settings.js`

```
GET    /api/settings                 list; ?material=&operation=&starred=1&archived=1
GET    /api/settings/:id             single row
POST   /api/settings                 create (role defaults to 'candidate')
PUT    /api/settings/:id             update (partial OK)
DELETE /api/settings/:id             delete
PUT    /api/settings/:id/star        toggle starred (0↔1)
PUT    /api/settings/:id/confirm     atomic: archive existing confirmed for same
                                     material+operation, set this one confirmed
```

### Docs — `routes/docs.js`

```
GET    /api/docs                     list sections; ?section=&tags=
GET    /api/docs/search?q=           full-text search via FTS5
GET    /api/docs/:id                 single section
```

### Notes — `routes/notes.js`

```
GET    /api/notes                    list; ?status=&topic=
POST   /api/notes                    create
PUT    /api/notes/:id                update (content, status, topic)
DELETE /api/notes/:id
```

### Files — `routes/files.js`

```
GET    /api/files                    list indexed files; ?ext=&tag=
POST   /api/files/scan               re-scan PROJECTS_DIR, upsert index
PUT    /api/files/:id/tag            set tag (keep/review/delete)
DELETE /api/files/:id                remove from index (does NOT delete file on disk)
POST   /api/files/:id/delete-file    delete the actual file from disk (requires confirm:true in body)
```

Disk deletion requires `{ "confirm": true }` in the request body as a
safety gate. Log the deletion to the console with timestamp and filepath.

---

## Frontend architecture

`public/index.html` is a single-page shell:
- Sidebar with nav links: Home, Sessions, Projects, Settings, Docs, Notes, Files, Quick Reference
- `<main id="content">` where page partials are injected
- `public/js/app.js` handles routing; fetches partial from `public/pages/`, calls
  `window.{page}Init()` (global function, not ES module — no build step)
- `loadedModules` object in `app.js` prevents double-loading `<script>` tags

Each `public/js/*.js` module attaches one `window.{page}Init` function.

**Cross-page navigation state:** use `window._autoExpandProjectId` (and similar
`window._*` globals) to pass state between pages before calling `navigate()`.
The destination page checks and clears the global on load. There is no URL param
mechanism in the router.

---

## Module behaviour notes

### Home page (`home.js`)

- Shows active session card if any session has `status = 'in_progress'`
- Shows planned session card if any session has `status = 'planned'`
- Setup checklist (pre-session safety items) and run checklist are stored in
  `localStorage` keyed as `cl-{sessionId}-setup` and `cl-{sessionId}-run`
- "Start Laser Run" button is gated on all run-checklist items being checked;
  enforced in JS, not the API
- Nav cards use CSS letter badges (PRJ/SES/SET/etc.) — not emoji, which render
  as monochrome glyphs on Linux
- Project cards on home page set `window._autoExpandProjectId` before navigating
  to the Projects page to trigger auto-expand

### Sessions page (`sessions.js`)

- "Start a New Session" form is visually distinguished with `border: 2px solid var(--accent)`
- Session lifecycle buttons: Begin (planned→in_progress), Complete, Abort
- Past sessions table: filter by status, outcome, project; stats strip shows counts
  for each status
- "Edit" button (not "View") opens inline detail panel for any session
- Detail panel: edit fields + observation list; observations can be added to any
  session including completed ones
- "→ Note" on an observation uses an inline form (not `prompt()`) to capture topic

### Projects page (`projects.js`)

- Edit form hides the project list while open (`list.style.display = 'none'`)
- Project detail expand loads sessions inline; "View all →" navigates to Sessions
  page with project filter pre-set
- Status count badges act as filter shortcuts

### Settings page (`settings.js`)

- Filter bar: material dropdown (populated from DB), operation radio
  buttons (all / engrave / score / cut), starred toggle
- Table columns: Material, Op, Power, Speed, LPI, Passes, Focus Offset,
  Notes, Role, ★, Actions (edit / confirm / delete)
- Archived settings hidden by default; visible with `?archived=1`
- Starred rows sort to the top within their material group

### Docs page

- Search box at top — calls `/api/docs/search?q=` using FTS5
- Section filter sidebar (Overview, Modes, Techniques, etc.)
- Result cards show title, section badge, body excerpt, tags
- Clicking a card expands the full body text

### Notes / learning tracker page

- Status tabs: All, Notes, Questions, Try This, Learned
- Add note form: topic input, content textarea, status select
- Inline status toggle on each card (cycling: note → try → learned → note)
- Export button: dumps all notes as markdown to clipboard

### Project files page

- Scan button triggers `POST /api/files/scan`; shows count of
  new / updated / unchanged files
- Filter: by extension, by tag
- File cards show: filename, size, extension badge, tag selector,
  notes field, "Delete file" button (with confirm dialog)
- File naming convention reminder shown at top of page:
  `ProjectName_Stage_Version_Date.ext`

### Quick reference page

Static cards — no API calls. Content is hardcoded HTML in
`public/pages/reference.html`. Sections:

1. Pre-job safety checklist (ventilation, PVC check, focus, red cross alignment)
2. Operation mode selection guide (scoring vs engraving decision tree)
3. AI → GIMP → Inkscape → Laser workflow summary
4. Inlay painting steps
5. Material test procedure

Include a print-friendly CSS class on this page: `@media print` hides the
sidebar and nav, renders cards full-width.

---

## Coding conventions

- Use `const` and `let` only — never `var`
- `async/await` in routes; wrap in try/catch; send `500` with `{ error: message }` on failure
- All DB calls go through the `db.js` singleton — never open a new connection in a route
- `better-sqlite3` is synchronous — do not `await` its calls
- Route files export an Express `Router` instance; `server.js` mounts them
- CSS: use CSS custom properties for the colour palette; no inline styles
  except for dynamically computed values (e.g. progress bar width)
- No `console.log` in production paths; use it freely in `seed.js` and
  the file scan endpoint

---

## Error handling

- API returns `{ error: "message" }` with appropriate HTTP status
- 404: unknown route → `{ error: "Not found" }`
- 400: missing required field → `{ error: "field X is required" }`
- 500: caught exception → `{ error: e.message }`
- Frontend: all fetch calls check `response.ok`; on failure, display an
  inline error banner inside `#content` (not an alert dialog)

---

## Git workflow

- `main` branch: stable, always runnable
- Feature branches: `feature/<short-name>` (e.g. `feature/file-delete`)
- Commit messages: imperative, lowercase, under 72 chars
  - Good: `add starred filter to settings api`
  - Bad: `Updated the settings API to support starred filtering`
- `.gitignore` must include: `data/`, `.env`, `node_modules/`
- Never commit `xtool.db` — it is personal operational data

---

## Running the project

`server.js` must call `require('dotenv').config()` as its **first line**,
before any other require that reads `process.env`. This populates `PORT`,
`DB_PATH`, and `PROJECTS_DIR` from `.env` before `db.js` is imported.

```bash
# Install dependencies
npm install

# First-time database seed
node db/seed.js

# Start development server
node server.js

# Open in browser
open http://localhost:3000
```

There is no hot-reload. Restart `node server.js` after backend changes.
Frontend changes (HTML/CSS/JS) take effect on page refresh.

---

## Known gaps to address (backlog)

These features are planned but not yet built. Do not implement them
unless explicitly requested, but be aware of them to avoid conflicting
design decisions.

- Material test array calculator: given a target material, suggest a
  power/speed grid to test (like XCS's Material Test Array feature)
- Export settings to CSV for sharing
- Photo attachments on usage log entries (store path, serve as static)
- Dark mode toggle (CSS custom properties already make this easy)
- LightBurn `.lbrn` file parser to extract embedded settings and
  auto-populate a usage log entry

---

## Domain knowledge: xTool S1 specifics

Keep this in mind when writing UI labels, help text, and comments.

**The machine:**
- xTool S1 20W diode laser engraver
- Supported software: xTool Creative Space (XCS) and LightBurn
- Auto-focus adjusts laser height to material; red cross aids alignment
- Baltic Birch cutting requires lowering focus by 2mm from auto-focus

**Parameter meanings:**
- Power: 0–100%, percentage of max laser output
- Speed: mm/sec (lower = slower = more energy delivered = deeper cut)
- LPI: lines per inch — raster scan density; higher = finer, slower
- Passes: number of times the laser traverses the same path
- Focus offset: millimetre adjustment from auto-focus baseline (negative = closer to material)

**Materials never to laser:**
PVC, vinyl, or any chlorine-containing material — releases toxic gases.
This warning should appear prominently on the Quick Reference page and
as a tooltip wherever material input fields appear.

**Operation definitions:**
- Engrave: raster, laser moves back-and-forth filling an area; slowest
- Score: vector, laser traces a path once; fast, produces fine lines
- Cut: vector, high power + slow speed + multiple passes; severs material

**File types used:**
- `.svg` — vector designs (primary format for scoring/cutting)
- `.lbrn` — LightBurn project files
- `.xcs` — xTool Creative Space project files
- `.png` — raster source images (before vectorization)
- `.xcf` — GIMP project files (intermediate, not used in laser software)

**Naming convention (from manual):**
`ProjectName_Stage_Version_Date.ext`
Example: `FlowerDesign_Vector_V2_230424.svg`
