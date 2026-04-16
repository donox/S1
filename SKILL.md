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

### Stage 3 — Narrative knowledge in `docs_sections`

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

### Stage 4 — Curated external links on Quick Reference

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

Prerequisites met (Phases 1–5 complete, data model stable). Before starting:

- Inventory every page and its features (Home, Sessions, Projects, Materials, Artifacts,
  Docs, Notes, Files, Users, Quick Reference)
- Confirm every API route is exercised and working
- Document all inter-page navigation state (`window._autoExpandProjectId`, etc.)
- Rewrite `SKILL-impl.md` to reflect the new frontend conventions

Bootstrap via CDN is the leading candidate (no build step, maps cleanly to existing
CSS custom-property palette). The backend (Express + SQLite routes) is unchanged.
Keep or replace `public/js/app.js` router pattern — no React/Vue/build pipeline unless
explicitly decided otherwise.

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
