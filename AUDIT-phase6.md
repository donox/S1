# Phase 6 Bootstrap Migration — Prerequisite Audit

Completed 2026-04-17. Read this before writing any Bootstrap HTML.

---

## Pages & Their Features

| Page | JS module | Status | Key features |
|------|-----------|--------|-------------|
| Home | home.js | ✅ Migrated | Nav cards grid (8), session context (3 states: none/planned/in-progress), dual checklists w/ localStorage, active projects grid, quick new project inline form, stats strip (5 boxes), recent sessions table |
| Sessions | sessions.js | ✅ Migrated | Start session form (gated), active session card w/ elapsed timer + obs quick-entry, filter bar, stats strip, session table, detail panel (edit fields + runs + session obs + run obs) |
| Projects | projects.js | ✅ Migrated | Status filter + count badge shortcuts, project list w/ milestone bars, edit form (hides list), detail expand (milestones + sessions), "View all →" nav |
| Settings | settings.js | ✅ Migrated | Filter bar, Material Profiles `<details>`, tree/summary view (collapsible material groups), flat table view, New/Edit/Improve form |
| Artifacts | artifacts.js | ✅ Migrated | List w/ delta badges, New/Edit form (4 deltas + default family picker) |
| Docs | docs.js | ✅ Migrated | Search + section + source filters, result cards w/ expand-on-click body, source badges |
| Notes | notes.js | ✅ Migrated | Tabs (All/Notes/Questions/Try/Learned), add form, status cycle button, export to clipboard |
| Files | files.js | ✅ Migrated | Scan button, filter (ext+tag), file cards w/ tag selector (inline save on change), Delete File, Remove Index |
| Users | users.js | ✅ Migrated | List w/ project/session counts, add form, rename inline, set-default, delete w/ inline ownership-warning confirm (NO confirm() — reference implementation) |
| Reference | (none) | ✅ Migrated | Static HTML, print-friendly |

---

## Inter-page Navigation State Globals

**Only one exists:**

| Global | Set in | Read/cleared in | Purpose |
|--------|--------|-----------------|---------|
| `window._autoExpandProjectId` | home.js project card onclick | projects.js loadData() — clears with `= null` | Auto-expand a project card when navigating from Home |

Sessions filter-from-projects uses no global — it does `navigate('sessions')` then `setTimeout(300ms)` + direct DOM manipulation.

---

## Inline Style → Bootstrap Utility Mapping

### Layout
| Inline | Bootstrap |
|--------|-----------|
| `display:flex; gap:N; align-items:X; flex-wrap:wrap` | `d-flex gap-N align-items-X flex-wrap` |
| `display:flex; justify-content:space-between` | `d-flex justify-content-between` |
| `display:flex; flex-direction:column` | `d-flex flex-column` |
| `display:none` / toggled via JS | `d-none` class toggle |
| `flex:1` | `flex-grow-1` |
| `flex-shrink:0` | `flex-shrink-0` |
| `margin-bottom:Npx` | `mb-N` |
| `margin-top:Npx` | `mt-N` |
| `padding:N` | `p-N` |
| `display:grid; grid-template-columns:repeat(auto-fill,...)` | custom `.grid-auto` utility (no BS equivalent) |

### Typography
| Inline | Bootstrap |
|--------|-----------|
| `font-size:0.875rem` | `small` / `fs-6` |
| `font-size:0.75–0.8rem` | `small` |
| `font-weight:600/700` | `fw-semibold` / `fw-bold` |
| `text-transform:uppercase` | `text-uppercase` |
| `font-style:italic` | `fst-italic` |
| `word-break:break-all` | `text-break` |
| `white-space:nowrap` | `text-nowrap` |

### Color
| Inline | Bootstrap |
|--------|-----------|
| `color:var(--text-muted)` / `#9eaab4` | `text-muted` |
| `color:var(--success)` / `#27ae60` | `text-success` |
| `color:var(--danger)` / `#c0392b` | `text-danger` |
| `color:var(--accent)` / `#e94560` | `text-primary` (map `--bs-primary` in custom.css) |
| `color:var(--accent2)` / `#f5a623` | `text-warning` (map `--bs-warning` in custom.css) |

Progress bar widths (`style="width:${pct}%"`) must stay inline — dynamic value.

### Components
| Current | Bootstrap |
|---------|-----------|
| `.banner-error / .banner-success` | `alert alert-danger` / `alert alert-success` |
| `showBanner()` with setTimeout | `Toast` component |
| `.badge` | `badge rounded-pill` |
| `.card` | `card` |
| `.btn .btn-primary/secondary/danger .btn-sm` | same names — near-zero change |
| `.filter-bar` | `card card-body` + `row g-2 align-items-end` |
| `.stats-strip / .stat-box` | `row g-3` + `col` + `card text-center` |
| `.tabs / .tab-btn` (notes) | `nav nav-pills` |
| `.inline-form` | `card card-body` |
| `.table-wrap + table` | `table-responsive` + `table table-dark table-hover` |
| `<details>/<summary>` (sessions dismissed obs, settings profiles) | keep native or use BS `Collapse` |
| Material group click-toggle in settings | BS `Collapse` |
| `confirm()` dialogs (6 of 9 modules) | leave as-is or convert to inline pattern (users.js is reference) |

---

## API Routes — All Confirmed Reachable

`/api/users`, `/api/families`, `/api/projects`, `/api/settings`, `/api/usage`, `/api/runs`, `/api/artifacts`, `/api/observations`, `/api/docs`, `/api/notes`, `/api/files`

All 11 route files present. All frontend calls match mounted paths.

---

## Pre-Migration Checklist (do before writing any Bootstrap HTML)

- [x] **Delete `public/pages/usage.html`** — orphan partial, superseded by `sessions.html`
- [x] **Fix `'🔴 Active'` emoji** in `sessions.js:1084` STATUS_BADGE — changed to `'● Active'`
- [x] **Extract shared `window.showToast(msg, type)`** — defined in `app.js`; all 8 modules updated; banner divs removed from page partials
- [x] **Write `custom.css`** — at `public/css/custom.css`; loaded after Bootstrap and `main.css` in `index.html`
- [x] **Rewrite `index.html`** — Bootstrap 5.3.3 via CDN, `data-bs-theme="dark"`, toast container, `main.css` kept for transition
- [x] **Decide `confirm()` policy** — **Keep native `confirm()` for all simple destructive actions** ("Delete this note?", "Delete this project?", etc.). The users.js inline pattern exists only where ownership context must be shown alongside the confirmation. No change needed before page migration.

**Migration complete.** All pages migrated. `main.css` removed from `index.html`.

---

## Known Gaps (carry forward — not Phase 6 scope)

- Run observations have no "→ Note" promote button (session-level has it; run-level only has Dismiss)
- Artifact picker missing from quick-start session form

---

## Bootstrap Approach (settled)

- Bootstrap 5.3 via CDN, `data-bs-theme="dark"` on `<html>`
- `custom.css` overrides BS CSS custom properties (see checklist above)
- Fully idiomatic — BS utility classes in all template literals, no inline `style=` except dynamic values
- BS JS used selectively: Toast (replaces banners), Collapse (replaces manual show/hide)
- SPA router (`app.js`) and `window.{page}Init` contract **unchanged**
- Backend **unchanged**
