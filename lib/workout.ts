import { getDb } from "./workout-db";
import { PROGRAM, PROGRAM_WEEKS, TM_FACTOR as TM_FACTOR_DEFAULT } from "./workout-program";
import { markDirty } from "./sheets-sync";
import { getExercise, getRegistryExercisesForLift, type ExerciseDef } from "./exercise-registry";

// ----- Key-value settings -----

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM workout_settings WHERE key = ?")
    .get<{ value: string }>(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO workout_settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, value);
}

export function getGoalDate(): string | null {
  return getSetting("goal_date");
}

// Goal date is sheet-exported (App Settings tab), so its mutations must flag
// the sheet dirty — use this, not raw setSetting("goal_date", …).
export function setGoalDate(date: string): void {
  setSetting("goal_date", date);
  markDirty();
}

export function getDaysOut(): { days: number; dateLabel: string } | null {
  const raw = getGoalDate();
  if (!raw) return null;
  const goal = new Date(raw);
  const now = new Date();
  const days = Math.ceil((goal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const dateLabel = goal.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return { days, dateLabel };
}

// ----- Lifts & program constants -----

export type LiftId = "squat" | "bench" | "deadlift";

export const LIFTS: { id: LiftId; label: string }[] = [
  { id: "squat", label: "Squat" },
  { id: "bench", label: "Bench Press" },
  { id: "deadlift", label: "Deadlift (Sumo)" },
];

const LIFT_IDS = new Set<string>(LIFTS.map((l) => l.id));

export function isLiftId(value: unknown): value is LiftId {
  return typeof value === "string" && LIFT_IDS.has(value);
}

// Canonical TM factor lives in workout-program.ts (client-safe); re-exported
// here for server-side callers already importing from lib/workout.
export { TM_FACTOR } from "./workout-program";

// Effective TM factor: the user-configurable `tm_factor` setting when valid,
// otherwise the program default. All e1RM→TM derivations (server routes and
// props handed to client forms) must go through this, never TM_FACTOR raw.
export function getTmFactor(): number {
  const raw = getSetting("tm_factor");
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0.5 && n <= 1 ? n : TM_FACTOR_DEFAULT;
}

// Auto-apply toggle for TM suggestions (D2). Default off: suggest-then-confirm.
// Sheet-exported (App Settings tab), so the setter flags the sheet dirty.
export function isTmAutoApplyEnabled(): boolean {
  return getSetting("tm_auto_apply") === "1";
}

export function setTmAutoApply(on: boolean): void {
  setSetting("tm_auto_apply", on ? "1" : "0");
  markDirty();
}

// Epley estimated 1RM. Null for non-positive weight/reps — a 0 kg or
// negative "lift" has no meaningful 1RM.
export function epley1rm(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Latest body-weight entry on or before the given YYYY-MM-DD date (defaults
// to today). Null when nothing is logged yet.
export function getLatestBodyWeightKg(onOrBefore?: string): number | null {
  const cutoff = onOrBefore ?? new Date().toISOString().slice(0, 10);
  const row = getDb()
    .prepare(
      "SELECT weight_kg FROM workout_body_weight WHERE date <= ? ORDER BY date DESC LIMIT 1"
    )
    .get<{ weight_kg: number }>(cutoff);
  return row?.weight_kg ?? null;
}

// RPE-aware effective reps (RIR-adjusted Epley): a set at RPE r had ~(10 − r)
// reps in reserve, so it demonstrates the same 1RM as reps + (10 − r) reps
// taken to failure. At RPE 10 (or with no RPE reported) this is plain Epley.
export function effectiveReps(reps: number, rpe?: number | null): number {
  if (rpe == null || rpe < 0 || rpe > 10) return reps;
  return reps + (10 - rpe);
}

// Registry-aware e1RM for a logged set (D3, roadmap 3.4). The exercise's
// e1rm_mode decides the formula:
//   epley             — RIR-adjusted Epley on the external weight (weight may
//                       be 0 → null, same as before the registry existed)
//   bodyweight_epley  — same, on effective load = latest body weight on/before
//                       the session date + external weight (negative external
//                       weight = assistance); null when no body weight is
//                       logged or the effective load is non-positive
//   none              — never computes an e1RM (e.g. timed holds)
// Unknown exercise names behave as plain external/epley. `rpe` (when reported)
// credits reps in reserve — a 1-rep set @6 is worth far less than one @10.
export function computeSetE1rm(
  exerciseName: string,
  weightKg: number,
  reps: number,
  sessionDate?: string,
  rpe?: number | null
): number | null {
  const def = getExercise(exerciseName);
  const mode = def?.e1rmMode ?? "epley";
  if (mode === "none" || def?.repMode === "time") return null;
  const r = effectiveReps(reps, rpe);
  if (mode === "bodyweight_epley") {
    const bw = getLatestBodyWeightKg(sessionDate);
    if (bw == null) return null;
    return epley1rm(bw + weightKg, r);
  }
  return epley1rm(weightKg, r);
}

// Server-side weight validation per the exercise's load_mode (2.4 + 3.4).
// Returns null when valid, otherwise a human-readable rejection reason.
export function validateSetWeight(exerciseName: string, weightKg: number): string | null {
  const def: ExerciseDef | null = getExercise(exerciseName);
  const loadMode = def?.loadMode ?? "external";
  if (loadMode === "assisted") {
    if (weightKg >= 0) return null;
    const bw = getLatestBodyWeightKg();
    if (bw == null) return "log a body weight before logging assisted sets with negative weight";
    if (bw + weightKg <= 0) return `assistance exceeds body weight (${bw} kg)`;
    return null;
  }
  return weightKg < 0 ? "weight must be ≥ 0" : null;
}

// ----- Types -----

export interface TrainingMax {
  lift: LiftId;
  e1rm: number;
  trainingMax: number;
  setAt: string;
}

export interface SessionRow {
  id: number;
  week: number;
  day: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SetRow {
  id: number;
  week: number;
  day: number;
  exercise: string;
  setNumber: number;
  prescribedWeight: number | null;
  prescribedReps: number | null;
  prescribedRpe: number | null;
  actualWeight: number | null;
  actualReps: number | null;
  actualRpe: number | null;
  e1rm: number | null;
  loggedAt: string | null;
}

// ----- Training maxes -----

interface TmDbRow {
  lift: string;
  e1rm: number;
  training_max: number;
  set_at: string;
}

// Latest training max per lift (rows are append-only history; newest wins).
export function getTrainingMaxes(): Record<string, TrainingMax> {
  const rows = getDb()
    .prepare(
      "SELECT lift, e1rm, training_max, set_at FROM workout_training_maxes ORDER BY set_at ASC, id ASC"
    )
    .all<TmDbRow>();

  const map: Record<string, TrainingMax> = {};
  for (const r of rows) {
    if (!isLiftId(r.lift)) continue;
    map[r.lift] = {
      lift: r.lift,
      e1rm: r.e1rm,
      trainingMax: r.training_max,
      setAt: r.set_at,
    };
  }
  return map;
}

export function isOnboarded(): boolean {
  const tms = getTrainingMaxes();
  return LIFTS.every((l) => tms[l.id] != null);
}

export interface TrainingMaxInput {
  lift: LiftId;
  e1rm: number;
  trainingMax: number;
}

// ----- TM provenance events -----
//
// Every training-max change is recorded in workout_tm_events with full
// context, so the UI can answer "why did my prescribed weight change?".
//   manual     — settings/onboarding save
//   auto       — autoregulation suggestion applied (confirmed or auto-apply)
//   suggestion — suggestion presented but not applied (applied = 0)
// The pre-Phase-4 JSON tag log (tm_autoregulation_log) is migrated in on
// first access and no longer written.

export type TmEventSource = "manual" | "auto" | "suggestion";

export interface TmEvent {
  id: number;
  lift: LiftId;
  e1rm: number;
  tm: number;
  source: TmEventSource;
  sourceWeek: number | null;
  sourceDay: number | null;
  setsUsed: number | null;
  impliedTm: number | null;
  damping: number | null;
  applied: boolean;
  createdAt: string;
}

export interface TmEventMeta {
  source: TmEventSource;
  sourceWeek?: number | null;
  sourceDay?: number | null;
  setsUsed?: number | null;
  impliedTm?: number | null;
  damping?: number | null;
  applied?: boolean;
}

interface TmEventDbRow {
  id: number;
  lift: string;
  e1rm: number;
  tm: number;
  source: string;
  source_week: number | null;
  source_day: number | null;
  sets_used: number | null;
  implied_tm: number | null;
  damping: number | null;
  applied: number;
  created_at: string;
}

const TM_EVENT_INSERT = `INSERT INTO workout_tm_events
  (lift, e1rm, tm, source, source_week, source_day, sets_used, implied_tm, damping, applied, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const TM_AUTO_LOG_KEY = "tm_autoregulation_log";

let tmEventsMigrated = false;

// One-time backfill: turn the pre-events TM history (workout_training_maxes
// rows + the legacy JSON auto-tag log) into events. Runs once per process and
// only when the events table is empty, so it is idempotent across restarts.
function ensureTmEventsMigrated(): void {
  if (tmEventsMigrated) return;
  tmEventsMigrated = true;
  const db = getDb();
  const n = db.prepare("SELECT COUNT(*) AS n FROM workout_tm_events").get<{ n: number }>()!.n;
  if (n > 0) return;
  const rows = db
    .prepare(
      "SELECT lift, e1rm, training_max, set_at FROM workout_training_maxes ORDER BY set_at ASC, id ASC"
    )
    .all<TmDbRow>();
  if (rows.length === 0) return;

  let autoTags: { lift: string; trainingMax: number; setAt: string }[] = [];
  try {
    const parsed = JSON.parse(getSetting(TM_AUTO_LOG_KEY) ?? "[]");
    if (Array.isArray(parsed)) autoTags = parsed;
  } catch {
    // corrupt legacy log — treat everything as manual
  }
  const autoKeys = new Set(autoTags.map((e) => `${e.lift}|${e.trainingMax}@${e.setAt}`));

  const stmt = db.prepare(TM_EVENT_INSERT);
  for (const r of rows) {
    if (!isLiftId(r.lift)) continue;
    const source = autoKeys.has(`${r.lift}|${r.training_max}@${r.set_at}`) ? "auto" : "manual";
    stmt.run(r.lift, r.e1rm, r.training_max, source, null, null, null, null, null, 1, r.set_at);
  }
  markDirty();
}

export function recordTmEvent(entry: TrainingMaxInput, meta: TmEventMeta, createdAt?: string): void {
  ensureTmEventsMigrated();
  getDb()
    .prepare(TM_EVENT_INSERT)
    .run(
      entry.lift,
      entry.e1rm,
      entry.trainingMax,
      meta.source,
      meta.sourceWeek ?? null,
      meta.sourceDay ?? null,
      meta.setsUsed ?? null,
      meta.impliedTm ?? null,
      meta.damping ?? null,
      meta.applied === false ? 0 : 1,
      createdAt ?? new Date().toISOString()
    );
  markDirty();
}

// All events, oldest first (optionally for one lift). Feeds the TM history
// chart, the provenance popover, and the TM History sheet tab.
export function getTmEvents(lift?: LiftId): TmEvent[] {
  ensureTmEventsMigrated();
  const db = getDb();
  const rows = lift
    ? db
        .prepare(
          "SELECT * FROM workout_tm_events WHERE lift = ? ORDER BY created_at ASC, id ASC"
        )
        .all<TmEventDbRow>(lift)
    : db.prepare("SELECT * FROM workout_tm_events ORDER BY created_at ASC, id ASC").all<TmEventDbRow>();
  return rows
    .filter((r) => isLiftId(r.lift))
    .map((r) => ({
      id: r.id,
      lift: r.lift as LiftId,
      e1rm: r.e1rm,
      tm: r.tm,
      source: r.source as TmEventSource,
      sourceWeek: r.source_week,
      sourceDay: r.source_day,
      setsUsed: r.sets_used,
      impliedTm: r.implied_tm,
      damping: r.damping,
      applied: r.applied === 1,
      createdAt: r.created_at,
    }));
}

// Latest applied event per lift — the provenance of the current TM.
export function getTmProvenance(): Partial<Record<LiftId, TmEvent>> {
  const out: Partial<Record<LiftId, TmEvent>> = {};
  for (const e of getTmEvents()) {
    if (e.applied) out[e.lift] = e;
  }
  return out;
}

// Idempotency guard: has this (lift, week, day) already produced an event of
// this source? Prevents double auto-apply and duplicate suggestion records.
export function hasTmEvent(
  lift: LiftId,
  week: number,
  day: number,
  source: TmEventSource
): boolean {
  ensureTmEventsMigrated();
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM workout_tm_events WHERE lift = ? AND source_week = ? AND source_day = ? AND source = ?"
    )
    .get<{ n: number }>(lift, week, day, source);
  return (row?.n ?? 0) > 0;
}

// Append a new training-max row per lift; history is preserved. Each entry
// whose values actually changed (or that is the lift's first TM) also gets a
// provenance event — meta defaults to a manual save.
// Returns the ISO timestamp stamped on the new rows (shared across the batch).
export function setTrainingMaxes(
  entries: TrainingMaxInput[],
  meta: TmEventMeta = { source: "manual" }
): string {
  // Migrate first: otherwise the rows inserted below would be swept into the
  // backfill AND get a fresh event each (duplicates).
  ensureTmEventsMigrated();
  const before = getTrainingMaxes();
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO workout_training_maxes (lift, e1rm, training_max, set_at) VALUES (?, ?, ?, ?)"
  );
  for (const e of entries) {
    stmt.run(e.lift, e.e1rm, e.trainingMax, now);
    const prev = before[e.lift];
    if (!prev || prev.e1rm !== e.e1rm || prev.trainingMax !== e.trainingMax) {
      recordTmEvent(e, meta, now);
    }
  }
  markDirty();
  return now;
}

export interface TmHistoryEntry {
  trainingMax: number;
  e1rm: number;
  setAt: string;
  reason: "Auto" | "Manual";
}

// Full TM history for a lift, oldest first, tagged Auto or Manual. Reads the
// events table (which the legacy JSON log is migrated into).
export function getTmHistory(lift: LiftId): TmHistoryEntry[] {
  return getTmEvents(lift)
    .filter((e) => e.applied)
    .map((e) => ({
      trainingMax: e.tm,
      e1rm: e.e1rm,
      setAt: e.createdAt,
      reason: e.source === "auto" ? "Auto" : "Manual",
    }));
}

// ----- Sessions -----

interface SessionDbRow {
  id: number;
  week: number;
  day: number;
  started_at: string | null;
  completed_at: string | null;
}

function mapSession(r: SessionDbRow): SessionRow {
  return {
    id: r.id,
    week: r.week,
    day: r.day,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

export function listSessions(): SessionRow[] {
  return getDb()
    .prepare(
      "SELECT id, week, day, started_at, completed_at FROM workout_sessions ORDER BY week ASC, day ASC"
    )
    .all<SessionDbRow>()
    .map(mapSession);
}

export function getSession(week: number, day: number): SessionRow | null {
  const r = getDb()
    .prepare(
      "SELECT id, week, day, started_at, completed_at FROM workout_sessions WHERE week = ? AND day = ?"
    )
    .get<SessionDbRow>(week, day);
  return r ? mapSession(r) : null;
}

// Create the session row if it does not exist yet, stamping started_at.
export function startSession(week: number, day: number): SessionRow {
  const existing = getSession(week, day);
  if (existing) return existing;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO workout_sessions (week, day, started_at) VALUES (?, ?, ?)"
    )
    .run(week, day, now);
  markDirty(); // sessions are sheet-exported
  return getSession(week, day)!;
}

// Restart the session clock: stamps started_at to now. Touches nothing else —
// logged sets and completion state are preserved.
export function resetSessionTimer(week: number, day: number): SessionRow | null {
  const existing = getSession(week, day);
  if (!existing?.startedAt) return existing ?? null;
  getDb()
    .prepare("UPDATE workout_sessions SET started_at = ? WHERE week = ? AND day = ?")
    .run(new Date().toISOString(), week, day);
  markDirty(); // sessions are sheet-exported
  return getSession(week, day)!;
}

export function completeSession(week: number, day: number): SessionRow {
  startSession(week, day);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      "UPDATE workout_sessions SET completed_at = ? WHERE week = ? AND day = ?"
    )
    .run(now, week, day);
  markDirty();
  return getSession(week, day)!;
}

export function uncompleteSession(week: number, day: number): SessionRow | null {
  getDb()
    .prepare("UPDATE workout_sessions SET completed_at = NULL WHERE week = ? AND day = ?")
    .run(week, day);
  markDirty();
  return getSession(week, day);
}

// ----- Sets -----

interface SetDbRow {
  id: number;
  week: number;
  day: number;
  exercise: string;
  set_number: number;
  prescribed_weight: number | null;
  prescribed_reps: number | null;
  prescribed_rpe: number | null;
  actual_weight: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  e1rm: number | null;
  logged_at: string | null;
}

function mapSet(r: SetDbRow): SetRow {
  return {
    id: r.id,
    week: r.week,
    day: r.day,
    exercise: r.exercise,
    setNumber: r.set_number,
    prescribedWeight: r.prescribed_weight,
    prescribedReps: r.prescribed_reps,
    prescribedRpe: r.prescribed_rpe,
    actualWeight: r.actual_weight,
    actualReps: r.actual_reps,
    actualRpe: r.actual_rpe,
    e1rm: r.e1rm,
    loggedAt: r.logged_at,
  };
}

export function getSetsForSession(week: number, day: number): SetRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM workout_sets WHERE week = ? AND day = ? ORDER BY exercise ASC, set_number ASC"
    )
    .all<SetDbRow>(week, day)
    .map(mapSet);
}

// Most recent logged set for the same exercise + set number at an earlier
// position in the program (used to show "Last time: …" reference values).
export function getPreviousSet(
  week: number,
  day: number,
  exercise: string,
  setNumber: number
): SetRow | null {
  const r = getDb()
    .prepare(
      `SELECT * FROM workout_sets
         WHERE exercise = ? AND set_number = ? AND logged_at IS NOT NULL
           AND (week < ? OR (week = ? AND day < ?))
         ORDER BY week DESC, day DESC
         LIMIT 1`
    )
    .get<SetDbRow>(exercise, setNumber, week, week, day);
  return r ? mapSet(r) : null;
}

// All "last time" references for the exercises trained on a given (week, day),
// keyed by "<exercise>#<setNumber>".
export function getPreviousSetMap(
  week: number,
  day: number,
  refs: { exercise: string; setNumber: number }[]
): Record<string, SetRow> {
  const map: Record<string, SetRow> = {};
  for (const { exercise, setNumber } of refs) {
    const prev = getPreviousSet(week, day, exercise, setNumber);
    if (prev) map[`${exercise}#${setNumber}`] = prev;
  }
  return map;
}

export function deleteSet(
  week: number,
  day: number,
  exercise: string,
  setNumber: number
): boolean {
  const result = getDb()
    .prepare(
      "DELETE FROM workout_sets WHERE week = ? AND day = ? AND exercise = ? AND set_number = ?"
    )
    .run(week, day, exercise, setNumber);
  if (result.changes > 0) markDirty();
  return result.changes > 0;
}

// Planned volume for all 16 weeks derived from the program + current TMs.
// Accessories use a 50kg placeholder. Returns one entry per week always.
export function getPlannedWeeklyVolume(): { week: number; planned: number; actual: number }[] {
  const tms = getTrainingMaxes();
  const tmValues = Object.values(tms);
  const fallbackTm = tmValues.length > 0
    ? tmValues.reduce((s, t) => s + t.trainingMax, 0) / tmValues.length
    : 100;

  const actualRows = getDb()
    .prepare(
      `SELECT week, COALESCE(SUM(actual_weight * actual_reps), 0) AS volume
       FROM workout_sets WHERE logged_at IS NOT NULL AND actual_weight IS NOT NULL AND actual_reps IS NOT NULL
       GROUP BY week`
    )
    .all<{ week: number; volume: number }>();
  const actualByWeek = Object.fromEntries(actualRows.map((r) => [r.week, Math.round(r.volume)]));

  return Array.from({ length: PROGRAM_WEEKS }, (_, i) => {
    const week = i + 1;
    const days = PROGRAM.filter((d) => d.week === week);
    let planned = 0;
    for (const day of days) {
      for (const ex of day.exercises) {
        const tm = ex.lift ? (tms[ex.lift]?.trainingMax ?? fallbackTm) : 0;
        for (const set of ex.sets) {
          if (set.percentOfTM != null && tm > 0) {
            planned += set.reps * (set.percentOfTM / 100) * tm;
          } else {
            planned += set.reps * 50;
          }
        }
      }
    }
    return { week, planned: Math.round(planned), actual: actualByWeek[week] ?? 0 };
  });
}

// Weekly training volume (sum of weight × reps across all logged sets).
export function getWeeklyVolume(): { week: number; volume: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT week, COALESCE(SUM(actual_weight * actual_reps), 0) AS volume
       FROM workout_sets
       WHERE logged_at IS NOT NULL AND actual_weight IS NOT NULL AND actual_reps IS NOT NULL
       GROUP BY week ORDER BY week ASC`
    )
    .all<{ week: number; volume: number }>();
  return rows.map((r) => ({ week: r.week, volume: Math.round(r.volume) }));
}

// e1RM history for a lift — best e1RM per session (week+day), ordered chronologically.
export interface E1rmPoint {
  week: number;
  day: number;
  e1rm: number;
  loggedAt: string;
}

// Exercise names belonging to a lift, read from the exercise registry (which
// is seeded from the program's `ex.lift` field — never from name patterns).
// Active swaps fold in: a swapped-in exercise inherits the original's lift.
export function getExercisesForLift(lift: LiftId): string[] {
  const names = new Set<string>(getRegistryExercisesForLift(lift));
  const swaps = getDb()
    .prepare("SELECT original_exercise, replacement_exercise FROM workout_swaps")
    .all<{ original_exercise: string; replacement_exercise: string }>();
  for (const s of swaps) {
    if (names.has(s.original_exercise)) names.add(s.replacement_exercise);
  }
  return [...names];
}

export function getE1rmHistory(lift: LiftId): E1rmPoint[] {
  const exercises = getExercisesForLift(lift);
  if (exercises.length === 0) return [];
  const placeholders = exercises.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT week, day, MAX(e1rm) AS e1rm, MAX(logged_at) AS logged_at
       FROM workout_sets
       WHERE logged_at IS NOT NULL AND e1rm IS NOT NULL
         AND exercise IN (${placeholders})
       GROUP BY week, day
       ORDER BY week ASC, day ASC
       LIMIT 200`
    )
    .all<{ week: number; day: number; e1rm: number; logged_at: string }>(...exercises);

  return rows.map((r) => ({
    week: r.week,
    day: r.day,
    e1rm: r.e1rm,
    loggedAt: r.logged_at,
  }));
}

// All completed sessions with total volume (sets × reps × weight) per session.
export interface SessionSummary {
  week: number;
  day: number;
  label: string;
  completedAt: string;
  setCount: number;
  totalVolume: number;
}

export function getCompletedSessions(): SessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.week, s.day, s.completed_at,
              COUNT(ws.id) AS set_count,
              COALESCE(SUM(ws.actual_weight * ws.actual_reps), 0) AS total_volume
       FROM workout_sessions s
       LEFT JOIN workout_sets ws ON ws.week = s.week AND ws.day = s.day AND ws.logged_at IS NOT NULL
       WHERE s.completed_at IS NOT NULL
       GROUP BY s.week, s.day
       ORDER BY s.week DESC, s.day DESC`
    )
    .all<{ week: number; day: number; completed_at: string; set_count: number; total_volume: number }>();

  return rows.map((r) => ({
    week: r.week,
    day: r.day,
    label: `Week ${r.week} · Day ${r.day}`,
    completedAt: r.completed_at,
    setCount: r.set_count,
    totalVolume: Math.round(r.total_volume),
  }));
}

// ----- Exercise swaps -----

export interface SwapRow {
  id: number;
  originalExercise: string;
  replacementExercise: string;
  scope: "day" | "block";
  week: number | null;
  day: number | null;
  blockEndWeek: number | null;
  createdAt: string;
}

interface SwapDbRow {
  id: number;
  original_exercise: string;
  replacement_exercise: string;
  scope: string;
  week: number | null;
  day: number | null;
  block_end_week: number | null;
  created_at: string;
}

function mapSwap(r: SwapDbRow): SwapRow {
  return {
    id: r.id,
    originalExercise: r.original_exercise,
    replacementExercise: r.replacement_exercise,
    scope: r.scope as "day" | "block",
    week: r.week,
    day: r.day,
    blockEndWeek: r.block_end_week,
    createdAt: r.created_at,
  };
}

// Get the active replacement for an exercise on a given (week, day).
// Day-scope swaps take precedence over block-scope swaps.
export function getActiveSwap(week: number, day: number, exercise: string): SwapRow | null {
  const daySwap = getDb()
    .prepare(
      "SELECT * FROM workout_swaps WHERE original_exercise = ? AND scope = 'day' AND week = ? AND day = ? ORDER BY id DESC LIMIT 1"
    )
    .get<SwapDbRow>(exercise, week, day);
  if (daySwap) return mapSwap(daySwap);

  const blockSwap = getDb()
    .prepare(
      "SELECT * FROM workout_swaps WHERE original_exercise = ? AND scope = 'block' AND block_end_week >= ? ORDER BY id DESC LIMIT 1"
    )
    .get<SwapDbRow>(exercise, week);
  return blockSwap ? mapSwap(blockSwap) : null;
}

// Get ALL active swaps that apply to a given session — keyed by original exercise name.
export function getSwapsForSession(week: number, day: number): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT * FROM workout_swaps ORDER BY id ASC")
    .all<SwapDbRow>();

  const map: Record<string, string> = {};
  for (const r of rows) {
    const s = mapSwap(r);
    if (s.scope === "day" && s.week === week && s.day === day) {
      map[s.originalExercise] = s.replacementExercise;
    } else if (s.scope === "block" && s.blockEndWeek != null && s.blockEndWeek >= week) {
      if (!map[s.originalExercise]) map[s.originalExercise] = s.replacementExercise;
    }
  }
  return map;
}

export function createSwap(
  originalExercise: string,
  replacementExercise: string,
  scope: "day" | "block",
  week: number,
  day: number,
  blockEndWeek: number | null
): SwapRow {
  const now = new Date().toISOString();
  // Remove any existing swap of same scope for this exercise+session
  if (scope === "day") {
    getDb()
      .prepare("DELETE FROM workout_swaps WHERE original_exercise = ? AND scope = 'day' AND week = ? AND day = ?")
      .run(originalExercise, week, day);
  } else {
    getDb()
      .prepare("DELETE FROM workout_swaps WHERE original_exercise = ? AND scope = 'block'")
      .run(originalExercise);
  }
  getDb()
    .prepare(
      "INSERT INTO workout_swaps (original_exercise, replacement_exercise, scope, week, day, block_end_week, created_at) VALUES (?,?,?,?,?,?,?)"
    )
    .run(originalExercise, replacementExercise, scope, week, day, blockEndWeek, now);

  const row = getDb()
    .prepare("SELECT * FROM workout_swaps WHERE original_exercise = ? ORDER BY id DESC LIMIT 1")
    .get<SwapDbRow>(originalExercise)!;
  markDirty();
  return mapSwap(row);
}

export function clearSwap(originalExercise: string, week: number, day: number): void {
  getDb()
    .prepare("DELETE FROM workout_swaps WHERE original_exercise = ? AND ((scope = 'day' AND week = ? AND day = ?) OR scope = 'block')")
    .run(originalExercise, week, day);
  markDirty();
}

// ----- Notes -----

export function getNote(week: number, day: number, exercise: string): string | null {
  const row = getDb()
    .prepare("SELECT note FROM workout_notes WHERE week = ? AND day = ? AND exercise = ?")
    .get<{ note: string }>(week, day, exercise);
  return row?.note ?? null;
}

export function setNote(week: number, day: number, exercise: string, note: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO workout_notes (week, day, exercise, note, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(week, day, exercise) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`
    )
    .run(week, day, exercise, note, now);
  markDirty();
}

export function deleteNote(week: number, day: number, exercise: string): void {
  getDb()
    .prepare("DELETE FROM workout_notes WHERE week = ? AND day = ? AND exercise = ?")
    .run(week, day, exercise);
  markDirty();
}

export function getNotesForSession(week: number, day: number): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT exercise, note FROM workout_notes WHERE week = ? AND day = ?")
    .all<{ exercise: string; note: string }>(week, day);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.exercise] = r.note;
  return map;
}

export interface LogSetInput {
  week: number;
  day: number;
  exercise: string;
  setNumber: number;
  prescribedWeight?: number | null;
  prescribedReps?: number | null;
  prescribedRpe?: number | null;
  actualWeight: number;
  actualReps: number;
  actualRpe?: number | null;
}

// Insert or update the logged set for (week, day, exercise, setNumber).
// e1RM is computed from the actual weight/reps via Epley.
export function logSet(input: LogSetInput): SetRow {
  const db = getDb();
  const now = new Date().toISOString();
  // Bodyweight-aware e1RM uses the body weight at the session's date (falls
  // back to today when the session hasn't been started yet).
  const sessionDate = getSession(input.week, input.day)?.startedAt?.slice(0, 10);
  const e1rm = computeSetE1rm(
    input.exercise,
    input.actualWeight,
    input.actualReps,
    sessionDate,
    input.actualRpe
  );

  const existing = db
    .prepare(
      "SELECT id FROM workout_sets WHERE week = ? AND day = ? AND exercise = ? AND set_number = ?"
    )
    .get<{ id: number }>(input.week, input.day, input.exercise, input.setNumber);

  if (existing) {
    db.prepare(
      `UPDATE workout_sets SET
         prescribed_weight = ?, prescribed_reps = ?, prescribed_rpe = ?,
         actual_weight = ?, actual_reps = ?, actual_rpe = ?,
         e1rm = ?, logged_at = ?
       WHERE id = ?`
    ).run(
      input.prescribedWeight ?? null,
      input.prescribedReps ?? null,
      input.prescribedRpe ?? null,
      input.actualWeight,
      input.actualReps,
      input.actualRpe ?? null,
      e1rm,
      now,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO workout_sets
         (week, day, exercise, set_number,
          prescribed_weight, prescribed_reps, prescribed_rpe,
          actual_weight, actual_reps, actual_rpe, e1rm, logged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.week,
      input.day,
      input.exercise,
      input.setNumber,
      input.prescribedWeight ?? null,
      input.prescribedReps ?? null,
      input.prescribedRpe ?? null,
      input.actualWeight,
      input.actualReps,
      input.actualRpe ?? null,
      e1rm,
      now
    );
  }

  // Ensure a session row exists so the set is attached to a session.
  startSession(input.week, input.day);

  const saved = db
    .prepare(
      "SELECT * FROM workout_sets WHERE week = ? AND day = ? AND exercise = ? AND set_number = ?"
    )
    .get<SetDbRow>(input.week, input.day, input.exercise, input.setNumber)!;
  markDirty();
  return mapSet(saved);
}

// ----- Body weight -----

export interface BodyWeightPoint {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

// Insert or update the body-weight entry for a given date (one per day).
export function logBodyWeight(date: string, weightKg: number): void {
  getDb()
    .prepare(
      "INSERT INTO workout_body_weight (date, weight_kg) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET weight_kg = excluded.weight_kg"
    )
    .run(date, weightKg);
  markDirty();
}

// Full body-weight history, oldest first.
export function getBodyWeightHistory(): BodyWeightPoint[] {
  const rows = getDb()
    .prepare("SELECT date, weight_kg FROM workout_body_weight ORDER BY date ASC")
    .all<{ date: string; weight_kg: number }>();
  return rows.map((r) => ({ date: r.date, weightKg: r.weight_kg }));
}

export function deleteBodyWeight(date: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM workout_body_weight WHERE date = ?")
    .run(date);
  if (result.changes > 0) markDirty();
  return result.changes > 0;
}
