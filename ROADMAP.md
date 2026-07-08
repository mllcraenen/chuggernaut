# Chuggernaut Roadmap

Phased plan for the feature/bug backlog. Ordering: bugs → small UX → exercise registry (foundation) → e1RM engine → sheet completeness → program design wizard.

## Design principles (apply to every item)

1. **No coupling to display strings.** Behavior must never key off exercise names or day labels (`"Squat Focus"`, `"Competition Squat"`). The warmups and swaps features silently died when the program changed from Calgary Barbell to Monolith precisely because they matched hardcoded strings. All behavior derives from *structure*: the `lift` field on program exercises, day composition, or (post-Phase 3) exercise-registry attributes. Display strings are for humans only.
2. **Fail loudly on program change.** Every feature that consumes program data gets a test-time invariant (e.g. "every program day resolves a warmup routine", "every exercise resolves to a lift or accessory classification"). Loading a new program must break tests, not silently disable features.
3. **Sheet round-trip rules** (every sheet-touching change):
   - Never change existing `_key` semantics; new key shapes must be explicitly skipped or handled by the parser (which must skip *unknown* shapes defensively, not crash).
   - New columns append to the right; import tolerates their absence.
   - Every change to emitted rows needs a lossless export→import→export test in `__tests__/workout-sheets.test.ts`.
   - Anything mutating exported data calls `markDirty()`.
   - Exercise renames (3.3) and program activation (6.4) invalidate sheets wholesale — force re-export, block import until it completes.
4. **Validate at the server, not just the client.** Client-side guards (e.g. `min={0}` on weight inputs) are UX; the API/lib layer enforces correctness.

## Confirmed decisions

- **D1 (emoji):** remove the 🏋 from the app's plate-toggle button; the sheet itself contains no emoji (only × / — typography), double-check what renders oddly there.
- **D2 (e1RM engine):** suggest-then-confirm, with a settings toggle for full auto-apply. Full transparency UI either way.
- **D3 (negative weight):** bodyweight-aware e1RM — effective load = latest logged body weight + external weight.
- **D4 (notes):** keep the per-(week, day, exercise) notes table (fix its missing schema); render into the sheet on the exercise's first set row; import back. A note column on `workout_sets` set-1 rows was considered and rejected: notes can exist before any set is logged (would require phantom rows with null actuals, splitting the table into two classes of row that every `logged_at IS NOT NULL` query must distinguish), and it couples the note's lifecycle to the set-1 log's delete path. The sheet layout is identical under both designs — the sheet is a rendering merged from program + sets + notes, not a table mirror.

---

## Phase 2.6 — UX round 2 (S/M total, next up; added 2026-07-07)

- **2.6.1 Wall-clock rest timer (S/M).** The timer counts down with interval ticks, so a backgrounded/blurred tab (throttled `setInterval`) desynchronizes it. Store an absolute end timestamp (`Date.now() + duration`) when the timer starts and render remaining = `end − now` on every tick/visibility change — the display self-corrects no matter how long the tab slept. (`components/workout/session-timer.tsx`.)
- **2.6.2 Italic prev-set text (S).** The "last time" numbers (2.1's `80 kg × 5 @8 (prescribed @7)` line) render in the same style as the set description; make them italic to differentiate. (`session-client.tsx`.)
- **2.6.3 Bold prescribed RPE (S).** Bold the prescribed RPE in the set prescription line. (`session-client.tsx`.)
- **2.6.4 Remove unused (i) icon (S).** Drop the info icon that does nothing. (`session-client.tsx` / session UI.)
- **2.6.5 Configurable TM factor (M).** Settings screen text claims TM is auto-calculated at 90 % but the code uses `TM_FACTOR = 0.88`. Make the factor a `workout_settings` key (default 0.88) editable in settings; both the display text and the e1RM→TM calculation read it. Server-side: same seam as `TM_FACTOR` in `lib/workout-program.ts` — the setting overrides the constant, one getter used everywhere (no component-local factors, per 1.2's test). New settings key needs a sync-coverage registry decision (2.5 scaffold enforces this).
- **2.6.6 Anton + Inter fonts (S).** Anton (heavy condensed display) for headings/hero numbers, Inter for body text, both via `next/font/google` (self-hosted at build time, no runtime CDN dependency). Decided 2026-07-07 — replaces the original Bevan idea (display slab, too heavy for body copy). Anton is headings-only; body stays Inter for legibility.

## Phase 0 — Trivia (S)

- **0.1** ~~Delete `__tests__/files.test.ts`~~ **Done on main** (PR #2 removed it).
- **0.2** Remove 🏋 from the plate-toggle button (`components/workout/session-client.tsx`); replace with text or an inline SVG consistent with the UI (D1).

## Phase 1 — Bug fixes (M total, each item independent)

- **1.1 Identical e1RM history charts (S/M).** `getE1rmHistory(lift)` (`lib/workout.ts:369`) binds the lift param to a no-op JOIN, so all three charts show the same series. Fix structurally: export `getExercisesForLift(lift: LiftId): string[]` derived from the program config's `ex.lift` field (never from name patterns), folding in active swaps (a swapped-in exercise inherits the original's lift). Filter the query with `ws.exercise IN (...)`. The helper is the single seam the registry (Phase 3) later replaces. Invariant test: for every lift, the helper returns a non-empty, disjoint set covering all `lift != null` program exercises.
- **1.2 Settings TM auto-compute (S).** `components/workout/settings-form.tsx` uses a local `TM_FACTOR = 0.9` (rest of app: 0.88) and initializes `tmTouched = true` for onboarded users, so editing e1RM never recomputes TM. Import the canonical `TM_FACTOR` from `lib/workout.ts`; init `tmTouched = false`, set true only on explicit TM-field edits. Add a test that no component defines its own TM factor (grep-style lint or shared-constant assertion).
- **1.3** ~~`workout_notes` missing from SCHEMA~~ **Done on main** (table is in `SCHEMA` since PR #3/#4 era). 2.2 is unblocked.
- **1.4 Warmups never render (S/M).** `lib/warmup-routines.ts` is keyed by old Calgary day labels; zero match the current program. **Do not re-key to the new labels** — re-key by structure: warmup drills defined per `LiftId` (squat/bench/deadlift warmup blocks) plus a general block; a day's warmup = general + the blocks for the distinct lifts appearing in that day's exercises (from `ex.lift`). Works for any future program with zero configuration. Invariant test: every program day yields ≥ 1 drill.
- **1.5 Swap alternatives all empty (M).** `lib/exercise-alternatives.ts` keys are old Calgary exercise names. **Do not rewrite the name-keyed map** — replace the lookup structurally (interim, until the registry): alternatives for an exercise = other program exercises sharing the same `lift`, plus a small pool of extra movements *keyed by lift* (e.g. squat-family: Front Squat, Belt Squat…), never by exercise name. Accessories (lift = null) get a free-text swap only (no suggestions) until the registry adds proper grouping. Invariant test: every main-lift program exercise yields ≥ 1 alternative. Fully superseded by Phase 3.2.
- **1.6 No auto-start + honest "Current" badge (M).** `app/workout/session/[week]/[day]/page.tsx:55` calls `startSession()` unconditionally on render, and `program-overview.tsx` links the active day straight to the session (bypassing the preview, where warmups live). Fix: remove start-on-render; all overview links go to `/workout/preview/...`; preview gets an explicit "Start workout" button hitting a new start route; session page redirects to preview when not started; "Current" badge = `started_at IS NOT NULL AND completed_at IS NULL` (keep a separate "Next" affordance for first-not-completed).
- **1.7 "5200%" sheet cell (S).** `lib/sheet-writer.ts:72` multiplies `percentOfTM` by 100, but it's already a whole number. Drop the `* 100`. Display-only fallback branch, import-safe; extend the sheet-writer unit test.
- **1.8 Stale block definitions + program-swap test fallout (S/M).** `CB16_BLOCKS` in `lib/workout-sheets.ts` still describes the 16-week Calgary layout while the program is 6 weeks — same display-string/hardcode failure class as 1.4/1.5. Derive block definitions from the program (e.g. chunk `PROGRAM_WEEKS` into 4-week blocks, or carry a `blocks` field in the program module) instead of a program-specific constant. The 5 currently-failing tests (warmup label test, sheet-writer/workout-sheets tests asserting Calgary exercise names and 4 blocks) get fixed alongside 1.4/1.8 with program-agnostic assertions per design principle 2.

## Phase 2 — Small UX + sheet round 1 (M/L total)

- **2.1 "Last time" shows RPE (S).** `getPreviousSetMap` already returns the full row; the page layer discards RPE (`session/[week]/[day]/page.tsx:105`). Thread prescribed + actual RPE through to `session-client.tsx`: "80 kg × 5 @8 (prescribed @7)". No DB change.
- **2.2 Notes ↔ sheet (M, needs 1.3).** Append a Notes column to block-tab headers, populated only on each exercise's first set row (D4). `WorkoutSheetWriter` gains a `notes` map input (stays pure/testable). Import reads the cell on first-set rows; empty cell clears the note (sheet authoritative, same as sets); import tolerates a missing column (old sheets).
- **2.3 Add/remove sets — accessories only (M).** DB already accepts any `set_number` via `logSet` upsert. UI: "+ Add set" at the bottom of an exercise (accessories only — gate on `ex.lift === null` now, registry `role` in Phase 3), "×" on extra sets; only the highest extra set is removable (no renumbering, no `_key` churn). New `deleteSet` API calling `markDirty()`. **Sheet export fix:** `generateBlock` currently iterates only the program's prescribed sets, silently dropping extras — append logged-beyond-prescription sets as rows with empty prescription cells but real `_key`s. Verify the import path already upserts them (it should, keys are self-describing).
- **2.4 Negative-weight server guard (S, interim).** Server-side: reject weight < 0 for normal exercises (client `min=0` is bypassable); `epley1rm` returns null for weight ≤ 0 or reps ≤ 0 instead of storing nonsense. Full assisted-exercise behavior lands in 3.4.
- **2.5 Sheet-sync coverage audit + scaffold (M).** Confirmed decisions (2026-07-06): scope = **all user-entered data** (sets, TMs, body weight, swaps, notes, session started/completed, goal date — internal machinery like sheets credentials, dirty flag, autoreg log exempt; autoreg history arrives via Phase 4's TM History tab); direction = **bidirectional where editable** (sheet-editable data round-trips; timestamps/goal date may be export-only with key shapes the importer explicitly skips, Phase 5-style).
  - *Audit:* close today's known gaps — `workout_sessions` and `goal_date` have no sheet representation at all; `deleteSet` doesn't `markDirty()` (overlaps 2.3); notes land via 2.2.
  - *Scaffold (the durable part):* a declarative **sync-coverage registry** — one module mapping every SCHEMA table and app-level `workout_settings` key to its tab + export/import path, or an explicit `exempt: <reason>` entry. Invariant tests derive from it: (i) every table parsed out of `SCHEMA` and every known settings key appears in the registry — a new table without a sync decision fails CI; (ii) every registered-as-synced entity has a lossless export→import→export test; (iii) every mutator in `lib/workout.ts` that writes a synced table calls `markDirty()` (assert via mocked `lib/sheets-sync`). Adding state then *forces* a conscious choice: map it or exempt it with a reason — nothing can be missed by accident.

## Phase 3 — Exercise registry (L; the foundation) — **Done (feature/chug-008, 2026-07-07)**

Shipped: `workout_exercises` + `workout_exercise_alternatives` (idempotent insert-only seed from the program + lift-keyed extras, user edits survive restarts), registry-backed `getExercisesForLift`/swap alternatives (static `lib/exercise-alternatives.ts` deleted), accessory add-set gate on `role`, editor GUI at `/workout/exercises` (rename blocked once the name is referenced by sets/swaps/notes — archive-and-recreate instead), bodyweight/assisted e1RM via `computeSetE1rm` + load-mode-aware `validateSetWeight` (server and sheet-import paths), timed exercises (`rep_mode = 'time'`, seconds in the reps column, no e1RM, "45s" prescription prose in the sheet), and an export-only Exercises sheet tab registered in sync-coverage.

Exercises become DB-backed entities. Swaps, e1RM behavior, accessory gating, warmup mapping, and the program wizard all hang off this — it is the durable fix for every string-matching failure above.

- **3.1 Data model (M).** `workout_exercises`: `name UNIQUE, lift NULL, role ('main'|'accessory'), load_mode ('external'|'bodyweight'|'assisted'), rep_mode ('reps'|'time'), e1rm_mode ('epley'|'bodyweight_epley'|'none'), archived`. Plus `workout_exercise_alternatives (exercise_id, alternative_id)` join table. Idempotent seed from the current program + lift-derived alternatives on startup (same `IF NOT EXISTS` philosophy as SCHEMA). Program config stays hardcoded for now but is *validated against the registry* at test time (every `ex.name` exists; `ex.lift` matches registry) — parity test before flipping lift to registry-derived.
- **3.2 Registry-backed reads (M).** Swap internals of 1.1's `getExercisesForLift`, replace 1.5's structural interim with registry alternatives (delete the static module), 2.3's accessory gate reads `role`, 3.4 reads `load_mode`/`e1rm_mode`/`rep_mode`.
- **3.3 Editor GUI (M/L).** `app/workout/exercises/`: list (grouped main/accessory, archived hidden), edit modal (all fields + allowed-swaps multi-select), creation wizard. CRUD routes under `app/api/workout/exercises/`. **Rename is the big risk:** logged sets store name strings and sheet `_key`s embed names. Either block rename once logged sets exist, or cascade transactionally to `workout_sets`/`workout_swaps`/`workout_notes` + force immediate sheet re-export (import is unsafe until it runs — enforce, don't document).
- **3.4 Bodyweight-aware e1RM (M, D3).** For `load_mode = 'bodyweight'|'assisted'`: effective load = latest body-weight entry ≤ session date + external weight (negative allowed for assisted; server validates `bw + w > 0`; client removes `min=0` for these exercises only). e1RM computed on effective load; UI shows "BW − 20 kg" style annotation. `rep_mode = 'time'` exercises get `e1rm_mode = 'none'` and a seconds input; sheet cell renders prose ("45s").

## Phase 4 — e1RM/TM engine + transparency (L) — **Done (feature/chug-009, 2026-07-08)**

Shipped: `workout_tm_events` provenance table (legacy `tm_autoregulation_log` migrated in idempotently, manual saves write changed-only events), server-side suggestion apply via `lib/autoregulation-db.ts` (recomputed server-side, idempotent per lift/session, suggestion events recorded with `applied = 0`), bodyweight-aware engine input (effective load from 3.4), provenance popover on prescribed weights (tap the weight: TM × % → plate-rounded + how the TM was set), per-lift TM step-line chart with manual/auto markers + RPE-table explainer on History, export-only "TM History" sheet tab, and the `tm_auto_apply` settings toggle (default off, D2).

**An engine already exists** (`lib/autoregulation.ts`, from PR #2): pure functions using a standard RPE table (`RPE_TABLE[reps][rpe]` = fraction of 1RM) to back out an implied TM per lift from prescribed-vs-reported RPE, weighted (top set ×2), damped (`DAMPING = 0.6`), capped ±5 %/session, 1 % noise floor. It is suggestion-based — `components/workout/autoregulate-sheet.tsx` presents post-session suggestions for approval (matches D2), and applied changes are tagged in a JSON log under `workout_settings` (`tm_autoregulation_log`). This phase does NOT rebuild it; it makes it trustworthy and visible — the current experience ("prescribed number changed and I have no idea why") is a transparency gap, not a missing engine.

- **Provenance data model.** Promote the JSON-log tagging to a proper `workout_tm_events` audit table: `lift, e1rm, tm, source ('manual'|'auto'|'suggestion'), source_week/day, sets_used, implied_tm, damping, applied, created_at`. Manual settings saves also write events so history is complete. Migrate existing `tm_autoregulation_log` entries into it. `workout_training_maxes` remains the current-value table.
- **Transparency UI.** (i) provenance popover on every prescribed weight: "TM 140 × 80 % = 112 → 112.5 (plate-rounded). TM set 2026-06-28 via autoregulation from W3D2 (3 sets, implied 158.2, damping 0.6)." Per-lift TM/e1RM step-line history chart from events, with manual-vs-auto markers. The RPE table and update rule get a human-readable explainer page/section. New export-only "TM History" sheet tab (no `_key`, explicitly skipped on import → zero round-trip risk).
- **"Last time" context** joins here: previous set shown with its prescribed and actual RPE (2.1), so a big prescribed-weight change is explainable next to what you actually did.
- **Auto-apply toggle.** `tm_auto_apply` setting: when on, suggestions apply automatically on session completion (still writing events); default stays suggest-then-confirm (D2). Idempotency guard per (week, day, lift).
- **Bodyweight lifts.** Engine consumes effective load from 3.4 for bodyweight/assisted exercises; until then it correctly ignores them (accessories have no `lift`).
- Can ship before Phase 3 for barbell lifts; 3.4 needed for full correctness on bodyweight movements.

## Phase 5 — Warmups in sheet (M; needs only 1.4)

All app data must exist human-readably in the sheet — warmups included.

- Writer emits warmup rows before each day's first exercise: `_key = week|day|W<n>|__warmup__` — a non-numeric setNumber token that can never collide with real set keys. Prescription cells carry the drill prose; log cells stay empty.
- Import explicitly skips `W*`-shaped keys (v1: warmups remain ephemeral/informational). The parser's defensive skip-unknown-shapes rule (design principle 3) makes this purely additive. Optional v2: persist warmup completion — only if actually used.
- Content sourced from the lift-keyed warmup routines (1.4), later from the registry/wizard. Lossless export→import→export test with warmup rows present.

## Phase 6 — Program design wizard (XL epic; hard-depends on Phase 3, benefits from 4)

Based on Chad Wesley Smith's *Powerlifting Program Design Manual*. **Blocked on Sir providing the method's material** (volume landmarks, intensity ranges per block type, frequency guidelines) before 6.2.

- **6.1 Programs as data (L).** Move from hardcoded `PROGRAM` to DB: `workout_programs`, `workout_blocks` (type: hypertrophy | strength | peaking), `workout_program_days`, `workout_program_exercises` (FK → registry), `workout_program_sets` (percentOfTM/rpe/reps). One active program. Seed the current Monolith program idempotently so nothing changes for the user. All readers plus `WorkoutSheetWriter`'s `BlockDefinition[]` (already a constructor arg — pays off here) switch to DB loaders; history gains a program dimension; sheet tab naming flows from blocks. Riskiest sub-phase.
- **6.2 Wizard UI (L).** Multi-step: program meta (goal, meet date — reuse goal-date) → blocks (count, type, length) → weekly template per block (days, lift focus) → per-day exercises (registry picker, swap-compatible) → sets/reps/intensity, with PPDM defaults per block type prefilled and editable.
- **6.3 Live analytics (M/L).** Recomputed on every edit: weekly sets per muscle group (needs a `muscle_groups` field on the registry — add as a 3.x follow-up), per-lift volume, average intensity per week, volume/intensity trends across blocks, per-lift progression curves. Pure functions over the draft program object → unit-testable; charts follow existing chart-component conventions.
- **6.4 Activation & lifecycle (M).** Validate → activate (regenerate sheet tabs, archive old ones, scope import to the active program's tabs), lock completed weeks against edits, program history.

## Dependency graph

```
P0 ─┐
P1 ─┼→ P2 → P3 (registry) → P4 (TM engine) → P6 (wizard)
    └───────────────────────→ P5 (warmups in sheet, needs 1.4 only)
```

P5 can slot anywhere after 1.4. P4 can start before P3 for barbell lifts only.
