import { getDb } from "./workout-db";
import { PROGRAM, PROGRAM_WEEKS } from "./workout-program";
import { markDirty } from "./sheets-sync";

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

// Epley estimated 1RM. Null for non-positive weight/reps — a 0 kg or
// negative "lift" has no meaningful 1RM (bodyweight-aware e1RM lands in 3.4).
export function epley1rm(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
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

// Append a new training-max row per lift. History is preserved.
// Returns the ISO timestamp stamped on the new rows (shared across the batch),
// which callers use to tag autoregulation-sourced entries.
export function setTrainingMaxes(entries: TrainingMaxInput[]): string {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO workout_training_maxes (lift, e1rm, training_max, set_at) VALUES (?, ?, ?, ?)"
  );
  for (const e of entries) {
    stmt.run(e.lift, e.e1rm, e.trainingMax, now);
  }
  markDirty();
  return now;
}

// ----- Autoregulation tagging -----
//
// We cannot add a "reason" column without a migration, so entries created by
// the autoregulation flow are tagged in a JSON log under workout_settings.
// Each tag identifies a TM row by lift + trainingMax + setAt.

const TM_AUTO_LOG_KEY = "tm_autoregulation_log";

export interface TmAutoLogEntry {
  lift: LiftId;
  trainingMax: number;
  setAt: string;
}

export function getTmAutoLog(): TmAutoLogEntry[] {
  const raw = getSetting(TM_AUTO_LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TmAutoLogEntry[]) : [];
  } catch {
    return [];
  }
}

// Tag the given lifts' TM rows (stamped at setAt) as autoregulation-sourced.
export function appendTmAutoLog(entries: TmAutoLogEntry[]): void {
  if (entries.length === 0) return;
  const log = getTmAutoLog();
  log.push(...entries);
  setSetting(TM_AUTO_LOG_KEY, JSON.stringify(log));
}

export interface TmHistoryEntry {
  trainingMax: number;
  e1rm: number;
  setAt: string;
  reason: "Auto" | "Manual";
}

// Full TM history for a lift, oldest first, each tagged Auto or Manual based on
// the autoregulation log.
export function getTmHistory(lift: LiftId): TmHistoryEntry[] {
  const rows = getDb()
    .prepare(
      "SELECT e1rm, training_max, set_at FROM workout_training_maxes WHERE lift = ? ORDER BY set_at ASC, id ASC"
    )
    .all<{ e1rm: number; training_max: number; set_at: string }>(lift);

  const autoKeys = new Set(
    getTmAutoLog()
      .filter((e) => e.lift === lift)
      .map((e) => `${e.trainingMax}@${e.setAt}`)
  );

  return rows.map((r) => ({
    trainingMax: r.training_max,
    e1rm: r.e1rm,
    setAt: r.set_at,
    reason: autoKeys.has(`${r.training_max}@${r.set_at}`) ? "Auto" : "Manual",
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

// Exercise names belonging to a lift, derived from the program's `ex.lift`
// field (never from name patterns). Active swaps fold in: a swapped-in
// exercise inherits the original's lift. This helper is the single seam the
// exercise registry (Phase 3) later replaces.
export function getExercisesForLift(lift: LiftId): string[] {
  const names = new Set<string>();
  for (const day of PROGRAM) {
    for (const ex of day.exercises) {
      if (ex.lift === lift) names.add(ex.name);
    }
  }
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
  const e1rm = epley1rm(input.actualWeight, input.actualReps);

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
