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
