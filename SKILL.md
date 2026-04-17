# SKILL.md — xTool S1 Guide Site: Index

This file is the entry point for project domain knowledge and implementation guidance.
It is intentionally split into three files based on **stability** — how likely each
section is to need updating as the code evolves.

**Why three files, not one?**
This project is partly a learning exercise. Separating knowledge by volatility makes
the architecture of the knowledge itself instructive: it forces an explicit answer to
the question "will this rule survive a code change?" That discipline is useful both
for maintaining the docs and for understanding which parts of the system are truly
stable vs. which are implementation choices.

| File | What it covers | Stability |
|------|---------------|-----------|
| `SKILL.md` (this file) | Index, roadmap, known gaps, phase notes | Updated per phase |
| `SKILL-domain.md` | Laser physics, machine specs, business rules, domain "why"s | Rarely changes — survives any code refactor |
| `SKILL-impl.md` | Code patterns, DB assumptions, magic numbers, CSS, implementation "why"s | High churn — largely rewritten at Phase 6 |

Read `SKILL-domain.md` to understand *what* the system does and *why* the rules exist.
Read `SKILL-impl.md` to understand *how* it is currently built.

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

---

## Known gaps (deferred, not blocking)

1. **Run observations cannot be promoted to a learning note.** Session-level observations
   have a "→ Note" promote button; run-level observations only have "Dismiss." The same
   promote flow (`POST /api/observations/:id/promote/note`) could be wired up in
   `renderRunObsSection` in `public/js/sessions.js`.

2. **Artifact picker missing from "Start a New Session" quick-start form.** The run
   form (add/edit run in the detail panel) has an artifact picker, but the quick-start
   form on the Sessions page does not pass `artifact_id` when auto-creating Run #1.

3. **`usage_log` still has legacy columns that are no longer read or written:**
   `material`, `operation`, `project_name`, `setting_id`. They were not dropped because
   `setting_id` has a FK constraint and `operation` has a CHECK constraint that SQLite
   cannot safely drop. These columns are vestigial — ignore them. `duration_min` is still
   actively used (shown and editable in the session detail panel).

---

## Planned feature track: External knowledge integration

The xTool community, xTool's own documentation, and the wider laser-cutting community
(Reddit r/lasercutting, forums, YouTube) contain extensive parameter tables and
material guidance that the app currently has no way to incorporate. The goal is to make
that knowledge accessible from within the app without creating an unmanageable
maintenance burden.

**Core design principle:** External knowledge enters the system at the `candidate` role
and must be personally validated on your specific machine before it becomes `confirmed`.
This preserves the meaning of `confirmed` — it always means *you* tested it. The `source`
field makes clear where a setting originated.

### Stage 1 — Source attribution on `material_settings` (data model change)

**Why first:** Every subsequent stage imports settings. Without a `source` field the
imported settings are indistinguishable from personal ones, which undermines the
confirmation workflow.

Changes:
- Add `source` column to `material_settings`:
  `TEXT DEFAULT 'personal' CHECK(source IN ('personal','xtool-official','community','other'))`
- Add `source_url` column (TEXT, nullable) for traceability back to the original page
- Migration in `db/db.js` MIGRATIONS array (safe to run idempotently)
- Update `schema.sql` DDL
- `db/seed.js`: mark all existing seeded rows as `source = 'personal'` (they came from
  the user's own manual transcription)
- Settings page UI: show a small source badge on each card (e.g. "xTool" in blue,
  "community" in amber, "personal" plain). Visually distinguish, don't hide.
- `GET /api/settings` and `POST /api/settings`: pass `source` and `source_url` through
- Filter bar: optional source filter so you can view only community settings or only
  your own

### Stage 2 — Structured settings import ✓ Complete

**Why second:** Once source attribution exists, you can import in bulk without losing
provenance.

Delivered:
- `db/import-settings.js`: CLI script reads a JSON file (`process.argv[2]`), validates
  rows, deduplicates on `(material, operation, power, speed)` via explicit SELECT check,
  inserts as `role='candidate'` with `source`/`source_url`; wrapped in a transaction;
  reports inserted/skipped/errors counts.
- `db/sample-import.json`: example import file with xtool-official and community rows.
- `POST /api/settings/import`: accepts `{ settings: [...] }` body, same logic as the
  script, returns `{ inserted, skipped, errors }`. All imports forced to `candidate`
  regardless of what the JSON specifies. `source` defaults to `'other'` if unrecognized.

### Stage 3 — Narrative knowledge in `docs_sections` ✓ Complete

**Why third:** Parameter rows in `material_settings` can't capture advice like "acrylic
tends to melt at the edges if speed is too low — try two passes faster rather than one
pass slow." That knowledge belongs in docs, which already have full-text search.

Changes:
- Add `source` (TEXT) and `source_url` (TEXT) columns to `docs_sections` (migration)
- Update `schema.sql` and the FTS5 triggers (triggers fire on `docs_sections` changes,
  so no trigger changes needed — they'll pick up new rows automatically)
- `db/import-docs.js` script: reads structured Markdown or JSON, inserts into
  `docs_sections` tagged with source. Idempotent via `INSERT OR IGNORE` on title+section.
- Initial content to import: xTool's material-specific guidance pages, community
  technique articles (summarised, not scraped verbatim — copyright awareness)
- Docs UI: show source badge on doc cards; filter sidebar gains a Source filter

### Stage 4 — Curated external links on Quick Reference ✓ Complete

**Why last (and lightest):** Some knowledge is best left external — xTool updates
their official docs, community wikis evolve. A curated link list is low maintenance
and always points to current information.

Changes:
- Add an "External Resources" section to `public/pages/reference.html` (static HTML,
  no API needed)
- Organised by category: Official xTool docs, Community parameter databases,
  Technique guides, Software (XCS, LightBurn)
- Review and update links periodically — these will go stale

### What goes where — decision guide

| Knowledge type | Destination | Why |
|----------------|-------------|-----|
| Specific power/speed/LPI numbers | `material_settings` as `candidate` | Fits the confirmation workflow; searchable |
| "This material behaves like X" narrative | `docs_sections` | FTS already built; not a parameter row |
| xTool's current official page | External link on Quick Reference | Goes stale; better to link than copy |
| Community forum thread | `source_url` on a setting, or docs excerpt | Link for traceability; extract the parameter |
| Your own validated result | `material_settings` as `confirmed` | This is what `confirmed` means |

### Skill file impact

When Stage 1 ships, add to `SKILL-domain.md`:
- The `source` field and its allowed values
- The rule that external settings always enter as `candidate`
- The rule that `confirmed` always means personally validated on your machine

When Stages 2–3 ship, add to `SKILL-impl.md`:
- The import script conventions and dedup strategy
- The `source_url` unique-index approach (if adopted)

---

## Phase 6 — UI redesign notes

### Decided approach

**Framework:** Bootstrap 5.3 via CDN, `data-bs-theme="dark"` on `<html>`.
No Bootswatch. No build step. No React/Vue/Webpack.

**Theme:** A small `custom.css` overrides Bootstrap's CSS custom properties
(`--bs-primary`, `--bs-body-bg`, etc.) to establish the project palette.
All colour and typography lives here — no inline `style=` attributes anywhere
in HTML or JS template literals.

**Adoption level: fully idiomatic.** JS template literals use Bootstrap utility
classes (`text-primary`, `d-flex`, `gap-2`, `small`, `fw-semibold`, etc.),
not `style="color:var(--accent)"`. This is non-negotiable — a hybrid approach
defeats the main purpose (community patterns, incremental evolution).

**Bootstrap JS:** Used selectively. Toasts replace the current banner pattern.
Collapse replaces manual show/hide. The inline-form patterns (observations,
promote flows) are kept as-is — they are better UX than modals and there is
a documented reason for them in `SKILL-impl.md`.

**Backend:** Express + SQLite routes are completely unchanged.

**Router:** `public/js/app.js` partial-injection SPA pattern and the
`window.{page}Init` contract are preserved. Bootstrap does not require a
different routing architecture.

### Guiding frame: look / maintain / evolve

This redesign is not primarily about aesthetics. The goal is a UI foundation
that supports incremental feature growth without accumulating CSS debt. Three
longer-term directions shape what "evolve" means here:

1. **Project variety drive** — the app should push the user toward doing more
   laser projects, not just record what happened. The home page needs to become
   a "what do I do next" surface, not just a status display.

2. **Community knowledge** — external knowledge integration (the source badge
   work in Stages 1–3) will grow. Bootstrap's semantic colour system
   (`text-warning`, `text-info`, etc.) is the right tool for making
   personal vs. external content visually distinct.

3. **AI approaches** — future sessions will explore having Claude reason over
   observation history, flag correlations, and suggest parameter refinements.
   AI-generated content needs a visual identity clearly distinct from
   user-entered data. `custom.css` should reserve a slot for this even if
   it is not implemented yet.

### Phase 6 scope: foundation, not final form

**In scope:**
- Full idiomatic Bootstrap throughout — retire all inline style debt
- Rethought home page structure (actionable, project-driving)
- `custom.css` establishing the palette and any custom utility classes
- `SKILL-impl.md` rewritten to document the new frontend conventions

**Out of scope (future work after Phase 6):**
- AI analysis features or insight views
- Cross-session query UI
- Making every page feature-complete beyond current functionality

The measure of success: adding a new page or component feels fast and
consistent because it draws from an established component vocabulary.

### Prerequisites before starting

1. Functionality audit — every page, every feature, every form behaviour
2. Inter-page navigation state globals (`window._autoExpandProjectId`, etc.)
3. Inline style inventory in JS files — what maps to which Bootstrap utility
4. API route smoke-test — confirm every route is reachable
5. Identify which Bootstrap JS components replace which hand-rolled patterns

---

## Working with this project

**Learning is an explicit goal.** The user is building this project partly to learn.
This shapes how decisions should be presented:

- When there is a trade-off between a simpler approach and a more instructive one,
  prefer the more instructive one and explain why.
- Always include the reasoning behind a decision, not just the outcome.
- When suggesting approaches, briefly note why one is better — don't pick silently.
- The three-file SKILL structure itself is an example: a single file would have been
  simpler to maintain but separating by stability teaches something about architecture.
