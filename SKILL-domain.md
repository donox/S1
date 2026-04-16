# SKILL-domain.md — Business Rules and Laser Domain Knowledge

This file covers **what the system does and why**. It should survive any code refactor,
including the Phase 6 frontend rewrite, unchanged. If you find yourself editing this
file because of a code change (not a rule change), something is in the wrong file.

For implementation details — how the rules are currently coded — see `SKILL-impl.md`.

---

## Laser safety (hard rule — never relax)

**Never laser PVC, vinyl, or any chlorine-containing material.** This releases toxic
hydrogen chloride gas, which is both immediately dangerous and corrosive to the machine.

The warning appears in three places in the UI: the material input tooltip in
`sessions.html`, the Quick Reference page, and `seed.js` comments. Add the same
warning to any new material input field, regardless of context.

---

## xTool S1 machine specifics

- **Model:** xTool S1 20W diode laser engraver
- **Supported software:** xTool Creative Space (XCS) and LightBurn
- **Auto-focus:** adjusts laser height to material surface automatically
- **Red cross:** alignment aid; verify it lands on the correct workpiece position before running
- **Enclosure:** must be closed before running

---

## Parameter meanings and ranges

| Parameter | Unit | Range | Meaning |
|-----------|------|-------|---------|
| Power | % of max output | 0–100 | Not watts — relative to machine maximum |
| Speed | mm/sec | ~9–400+ | Lower = slower = more energy delivered per mm |
| LPI | lines per inch | 100–500 | Raster scan density; higher = finer detail, slower |
| Passes | count | 1–5+ | How many times the laser traverses the same path |
| Focus offset | mm | -5 to +5 | Adjustment from auto-focus baseline; negative = closer to material |

**Baltic Birch 3/16" cutting requires `focus_offset_mm = -2`.** This is a physical
machine requirement, not a preference. Auto-focus targets the material surface; lowering
by 2mm places the focal point at mid-material depth, which significantly improves
cut-through on thick material. This value is hardcoded in `db/seed.js` and must never
be changed to 0.

**Glass engraving reference settings:** power 70–80%, speed 80–200 mm/sec, 200 LPI,
1 pass. Speed 140 mm/sec performs well as a starting point.

---

## Operation definitions

| Operation | Mode | Typical use |
|-----------|------|-------------|
| Engrave | Raster — laser sweeps back-and-forth | Filling areas, photos, shading |
| Score | Vector — laser traces a path once | Fine lines, outlines, text |
| Cut | Vector, high power + multiple passes | Severing material completely |

Engraving is slowest (raster fill). Scoring is fast (single vector pass). Cutting needs
high power, low speed, and multiple passes. A single session run can mix operations —
this is modelled as multiple `run_settings` rows on one run, each with its own
`operation`, `purpose`, and parameters.

---

## File types

| Extension | Tool | Role |
|-----------|------|------|
| `.svg` | Any vector editor | Primary format for scoring/cutting designs |
| `.lbrn` | LightBurn | LightBurn project files (may embed settings) |
| `.xcs` | xTool Creative Space | XCS project files |
| `.png` | Any raster editor | Source images before vectorization |
| `.xcf` | GIMP | Intermediate editing; not used directly in laser software |

**File naming convention (from manual):** `ProjectName_Stage_Version_Date.ext`
Example: `FlowerDesign_Vector_V2_230424.svg`

---

## Business rules

### Material setting roles

Roles flow **one direction only**: `candidate` → `confirmed` → `archived`. No going
back, no skipping. This is an intentional design choice — see "Why archive instead of
delete" below.

- Every new setting starts as `candidate`.
- **Exactly one `confirmed` setting is allowed per `(family_id, operation)` pair.**
  Confirming a new one atomically archives the previous confirmed one. This constraint
  is enforced in application logic (a `db.transaction()` in `routes/settings.js
  PUT /:id/confirm`), not as a database constraint.
- `archived` settings are hidden from normal listing. They remain in the database as
  history. They are never hard-deleted.
- `starred` is orthogonal to role — it is a user bookmark ("looks promising") and does
  not imply confirmed status. A user can star multiple candidates before deciding which
  to confirm.

### Material profiles (`setting_families`)

`setting_families` gives each distinct material variant a stable identity, replacing
free-text material strings that inevitably drift ("Walnut", "walnut", "Walnut 1/4").

- Each family has a `material` name and a `profile_name` (e.g. "Walnut — thin veneer").
- The confirmed-setting constraint is per `(family_id, operation)`, so you can have
  "confirmed for thin walnut" and "confirmed for thick walnut" simultaneously.
- **Setting lineage:** `material_settings.parent_id` is a self-referential FK. To
  improve a setting, create a child row pointing at the parent — do not edit the parent
  in place. The parent is archived; the child starts as candidate. This preserves the
  full history of parameter evolution. The UI calls this "Improve this setting"; it
  pre-populates a new child row with the parent's values for the user to modify.
  Lineage chains can branch (two children from one parent = two experimental directions).

### Users

- `users` holds local named identities. No passwords, no authentication — this is a
  single-machine local app.
- One user can be flagged `is_default = 1`. That user is pre-selected on all forms.
- Projects have one `owner_id` FK (the person responsible for the project).
- Sessions (`usage_log`) have `user_id` (primary session owner) and a `session_users`
  junction table for sessions where multiple people are present.
- Deleting a user does **not** delete their projects or sessions. The FK is set to NULL,
  preserving history. The UI warns before allowing deletion if the user owns anything.

### Session lifecycle

States flow: `planned → in_progress → completed | aborted`

- A `planned` session appears on the Home page with two checklists (setup and pre-run).
  "Start Laser Run" is gated on all pre-run items being checked — enforced in JS, not
  the API. This is intentional: the gate is a safety reminder, not a hard constraint.
- A `planned` session has no material or operation on the session row itself. Those
  belong to runs, which are added after beginning.
- Transitioning to `in_progress` records `started_at`.
- Transitioning to `completed` or `aborted` records `ended_at`.
- There is no `paused` state. If a user walks away, the session stays `in_progress`
  until they explicitly close it.
- **At most one session should be `in_progress` at a time.** The API does not enforce
  this; the Home page handles it by showing the most recent one if multiple exist.

### Session vs. Run model

A **session** is a single sitting at the laser. It owns: project, user, date/time,
overall outcome, notes, duration. It has no material or operation of its own.

A **run** is one distinct laser job within a session. One session can contain many runs.
Example: the same session might include engraving a bowl interior (Run 1) and scoring
the rim (Run 2) — different materials, operations, and settings.

Runs carry: `material`, `artifact_id`, `file_used`, `outcome`, `notes`, `started_at`,
`ended_at`, `run_number` (sequential within the session).

**Each run can have N settings** via the `run_settings` junction table. A single run
might use engrave settings for the fill and score settings for the outline. Each
`run_settings` row has its own `operation`, `purpose` (free text explaining which part
of the design it applies to), and parameter fields. A `run_settings` row can link to a
saved `material_settings` row via FK (inheriting its parameters) or store ad-hoc values
directly; own fields override the linked setting's values when both are present.

**Observations** attach to runs (via `run_id`), not to sessions. An observation is
about a specific laser job. `session_observations.session_id` is always populated
(auto-derived from the run's session when only `run_id` is provided).

### Artifacts and modifiers

An **artifact** is a named thing being made — coaster, box lid, pendant, sign. It is
distinct from the material (what it is made of) and the design file (how it looks).
The same artifact type may be made from different materials, so the artifact stores
*deltas* rather than absolute parameter values.

Artifact parameter deltas: `power_delta` (±%), `speed_delta` (±mm/sec), `focus_delta`
(±mm), `passes_delta`. These are applied on top of the base material setting.

**Modifier application order:**
```
base material setting
  → + artifact deltas
  → + per-run manual overrides (if any)
  = effective parameters (computed in UI, never stored)
```

Each layer is optional. Only deltas are stored; the UI computes and displays effective
values. This keeps the stored data meaningful even as the base setting evolves — a delta
of "+5% power" stays correct regardless of what the base power is changed to.

### Setting source attribution

Every `material_settings` row carries a `source` field indicating where the parameters
came from, and an optional `source_url` linking back to the original reference.

Allowed values for `source`:

| Value | Meaning |
|-------|---------|
| `personal` | Parameters you tested yourself on your machine — the default |
| `xtool-official` | From xTool's own documentation or parameter tables |
| `community` | From forums, Reddit, YouTube, or other community sources |
| `other` | Any other origin (import scripts, etc.) |

**The confirmation workflow is independent of source.** A community setting can be
confirmed once you have personally validated it produces the expected result on your
machine. A personal candidate can stay unconfirmed indefinitely. Source describes
*origin*; role describes *your confidence in it*.

**`confirmed` always means personally validated.** Importing an xTool-official setting
does not make it confirmed — it enters as `candidate` and earns confirmation through
your own experience. This is what keeps the `confirmed` designation meaningful.

`source_url` is optional but recommended for non-personal settings. It provides
traceability back to the original page so you can re-check the source or find related
information.

---

### Project deletion policy

Deleting a project **does not** delete its sessions. Instead, sessions are detached
(`project_id` set to NULL). Sessions represent real work done and must be preserved for
usage statistics even if the parent project is no longer relevant. Sessions become
"standalone" rather than disappearing.

### Observation retention

Observations are soft-deleted: the user dismisses them (sets `dismissed_at`) but they
remain in the database. A hard purge via `DELETE /api/observations/purge` removes those
older than **90 days**. This window is hardcoded in SQL — there is no user-facing
configuration for it. The intent is that dismissed observations act as a grace period
before permanent removal.

---

## Domain "why"s — design decisions that outlast any implementation

**Why detach sessions on project delete instead of cascading:**
Sessions are historical records of real work. Cascading deletes would silently destroy
data that may be needed for statistics or review. "The project is done" does not mean
"these sessions never happened."

**Why archive instead of delete on setting confirm:**
Users need to trace the evolution of their settings — what they tried, what worked, what
was superseded. Archiving provides a complete lineage. If you delete the old confirmed
setting, you lose the history of why you changed it.

**Why parent_id for setting lineage instead of a separate versions table:**
A self-referential FK keeps all settings in one table, making queries simple (one JOIN).
It also naturally supports branching: if you want to explore two different directions
from one parent setting, you create two children. A versions table would require a
separate entity and complicate the branching case.

**Why family_id (profiles) instead of just a material text field:**
Free-text material names drift. "Walnut", "walnut", "Walnut veneer", "walnut 1/4in" are
all the same material to a human but different strings to a query. Profiles give each
variant a stable, typed identity that survives typos and capitalization differences.

**Why runs are separate rows instead of a JSON array on the session:**
Individual runs need their own outcome, observations, artifact, timestamps, and settings.
JSON arrays in SQLite cannot be queried per-element efficiently, cannot be the target of
FK cascades, and cannot be indexed. Separate rows enable filtering ("show all runs where
material = Cherry"), aggregation (success rate per material), and cascade deletes.

**Why `run_settings` is a junction table (N settings per run):**
A single laser session can engrave the interior of a piece and then score the outline —
two different operations, parameters, and purposes on the same workpiece. A single
`setting_id` FK on the run would force a choice; a junction table captures the reality
that one job often involves multiple laser passes with different parameters.

**Why artifacts carry deltas not absolute values:**
An artifact modifier expresses a relationship: "this artifact type needs slightly more
power than whatever the base material setting is." If the base setting changes (because
you found a better recipe), the delta remains correct without any update. Absolute values
would duplicate the base setting and immediately diverge from it.

**Why the `confirmed` constraint lives in application logic, not the DB:**
SQLite does not support partial unique indexes (unique within a subset of rows). The
constraint "one confirmed per family+operation" cannot be expressed as a DB constraint.
Enforcing it in a `db.transaction()` in the route is the correct trade-off: slightly
less safe than a DB constraint, but explicit, auditable, and testable.

**Why observation types use a fixed list (note/discovery/issue/question):**
Free-form tags create synonyms and inconsistency over time. The fixed list maps each
type to a specific workflow: notes → learning_notes, issues → future investigation,
questions → things to test, discoveries → candidate settings. This makes the observation
list actionable rather than just a log.

**Why starred doesn't mean confirmed:**
Starred is a user bookmark ("this one looks interesting, come back to it"), while
confirmed means "this is the current production setting." A user might star several
candidates while evaluating them before deciding which to confirm. Conflating the two
states would make it impossible to bookmark candidates without accidentally confirming them.

**Why session checklist state lives in localStorage, not the DB:**
The pre-run checklist ("ventilation on," "material secured") is transient safety
scaffolding, not business data. Writing a DB row for every checkbox click is
disproportionate. The session ID keys the storage, so checklist state automatically
becomes stale when the session is completed and won't pollute future sessions.
