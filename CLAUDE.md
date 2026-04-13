# CLAUDE.md — xTool S1 Local Guide Site

This file is the authoritative project reference for Claude Code.
Read it fully before making any changes.

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
xtool-guide/
├── CLAUDE.md                  ← this file
├── .env                       ← local config (gitignored)
├── .env.example               ← committed template
├── .gitignore
├── package.json
├── server.js                  ← Express entry point
├── db/
│   ├── schema.sql             ← source-of-truth DDL
│   ├── seed.js                ← one-time data import script
│   └── db.js                  ← better-sqlite3 singleton
├── routes/
│   ├── settings.js            ← /api/settings/*
│   ├── usage.js               ← /api/usage/*
│   ├── docs.js                ← /api/docs/*
│   ├── notes.js               ← /api/notes/*
│   └── files.js               ← /api/files/*
├── public/
│   ├── index.html             ← shell with sidebar nav
│   ├── css/
│   │   └── main.css
│   ├── js/
│   │   ├── app.js             ← router / nav logic
│   │   ├── settings.js
│   │   ├── usage.js
│   │   ├── docs.js
│   │   ├── notes.js
│   │   └── files.js
│   └── pages/
│       ├── settings.html      ← partial HTML injected by app.js
│       ├── usage.html
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

`db.js` opens the SQLite database and applies the schema at startup:

```js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(process.env.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

module.exports = db;
```

`better-sqlite3` is **synchronous** — never `await` its calls. Always import
this module; never open a second `Database` instance in a route file.

### `db/schema.sql` — source-of-truth DDL

Schema lives in `db/schema.sql`. Always update this file when adding or
altering tables. The singleton executes it at every startup using
`PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON`.

### Tables

**`material_settings`**
Stores laser parameters. Each row is one tested combination.
```sql
CREATE TABLE IF NOT EXISTS material_settings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  material    TEXT NOT NULL,          -- e.g. "Walnut", "Black Acrylic"
  operation   TEXT NOT NULL           -- "engrave" | "score" | "cut"
                CHECK(operation IN ('engrave','score','cut')),
  power       INTEGER,               -- 0–100 %
  speed       INTEGER,               -- mm/min
  lines_per_inch INTEGER,
  passes      INTEGER DEFAULT 1,
  focus_offset_mm REAL DEFAULT 0,    -- e.g. -2 for Baltic Birch cut
  notes       TEXT,
  starred     INTEGER DEFAULT 0,     -- 1 = user-marked as best
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
```

**`usage_log`**
One row per laser session.
```sql
CREATE TABLE IF NOT EXISTS usage_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_date     TEXT NOT NULL,        -- ISO date YYYY-MM-DD
  material     TEXT,
  operation    TEXT CHECK(operation IN ('engrave','score','cut','mixed')),
  project_name TEXT,
  duration_min INTEGER,
  file_used    TEXT,                 -- filename or path
  setting_id   INTEGER REFERENCES material_settings(id),
  outcome      TEXT CHECK(outcome IN ('success','partial','failed')),
  notes        TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
```

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

### Settings — `routes/settings.js`

```
GET    /api/settings                 list all; ?material=&operation=&starred=1
GET    /api/settings/:id             single row
POST   /api/settings                 create new row
PUT    /api/settings/:id             update (partial OK)
DELETE /api/settings/:id             delete
PUT    /api/settings/:id/star        toggle starred field
```

### Usage log — `routes/usage.js`

```
GET    /api/usage                    list; ?from=&to=&outcome=
POST   /api/usage                    log a session
DELETE /api/usage/:id
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
- Sidebar with nav links: Dashboard, Settings, Usage Log, Docs, Notes, Files, Quick Reference
- `<main id="content">` where page partials are injected
- `public/js/app.js` handles routing via `history.pushState`, fetches
  the appropriate partial from `public/pages/`, and calls the module's
  `init()` function

Each `public/js/*.js` module exports one `init(container)` function that
fetches data from the API and renders into `container`.

**No global state between modules.** Each module fetches what it needs.

---

## Module behaviour notes

### Settings page

- Filter bar: material dropdown (populated from DB), operation radio
  buttons (all / engrave / score / cut), starred toggle
- Table columns: Material, Op, Power, Speed, LPI, Passes, Focus Offset,
  Notes, ★, Actions (edit / delete)
- Inline edit: clicking a row opens a form below the table, pre-filled;
  same form is used for new rows
- Starred rows sort to the top within their material group

### Usage log page

- Form at top: date, material, operation, project name, duration,
  file used, link to setting (optional dropdown), outcome, notes
- Table below, newest first
- Basic summary stats at top: total sessions, most used material,
  success rate

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
- Speed: mm/min (lower = slower = more energy delivered = deeper cut)
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
