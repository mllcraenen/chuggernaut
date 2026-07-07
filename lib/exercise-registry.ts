// Exercise registry (roadmap Phase 3) — exercises as DB-backed entities.
//
// This is the durable replacement for every display-string coupling: swaps,
// e1RM behavior, the accessory add-set gate, and (later) the program wizard
// all read exercise attributes from here instead of matching names.
//
// Seeding is idempotent and insert-only: every program exercise plus a small
// lift-keyed pool of extra movements is inserted if missing, and same-lift
// alternative links are created only for newly inserted exercises — so user
// edits (mode changes, added/removed alternatives) survive restarts. The
// program config stays hardcoded for now and is validated against the
// registry at test time (see __tests__/exercise-registry.test.ts).

import { getDb } from "./workout-db";
import { markDirty } from "./sheets-sync";
import { PROGRAM } from "./workout-program";
import type { LiftId } from "./workout";

export type ExerciseRole = "main" | "accessory";
export type LoadMode = "external" | "bodyweight" | "assisted";
export type RepMode = "reps" | "time";
export type E1rmMode = "epley" | "bodyweight_epley" | "none";

export const ROLES: ExerciseRole[] = ["main", "accessory"];
export const LOAD_MODES: LoadMode[] = ["external", "bodyweight", "assisted"];
export const REP_MODES: RepMode[] = ["reps", "time"];
export const E1RM_MODES: E1rmMode[] = ["epley", "bodyweight_epley", "none"];

export interface ExerciseDef {
  id: number;
  name: string;
  lift: LiftId | null;
  role: ExerciseRole;
  loadMode: LoadMode;
  repMode: RepMode;
  e1rmMode: E1rmMode;
  archived: boolean;
}

interface ExerciseDbRow {
  id: number;
  name: string;
  lift: string | null;
  role: string;
  load_mode: string;
  rep_mode: string;
  e1rm_mode: string;
  archived: number;
}

function mapExercise(r: ExerciseDbRow): ExerciseDef {
  return {
    id: r.id,
    name: r.name,
    lift: (r.lift as LiftId) ?? null,
    role: r.role as ExerciseRole,
    loadMode: r.load_mode as LoadMode,
    repMode: r.rep_mode as RepMode,
    e1rmMode: r.e1rm_mode as E1rmMode,
    archived: r.archived === 1,
  };
}

// Extra movements per lift family, beyond what the program already contains
// (carried over from the pre-registry structural interim, roadmap 1.5).
const EXTRA_BY_LIFT: Record<LiftId, string[]> = {
  squat: ["Front Squat", "Belt Squat", "Leg Press", "Paused Squat"],
  bench: ["Close-grip Bench", "Incline Bench", "DB Bench Press", "Larsen Press"],
  deadlift: ["Trap Bar Deadlift", "Block Pull", "Deficit Deadlift", "Romanian Deadlift"],
};

// ----- Seeding -----

let seededThisProcess = false;

// Idempotent, insert-only seed. Never updates existing rows, so user edits
// made through the editor GUI are preserved. Alternative links are only
// created for exercises inserted in this run, so a deliberately removed link
// between two pre-existing exercises stays removed.
export function seedExerciseRegistry(): void {
  const db = getDb();

  type SeedEntry = { name: string; lift: LiftId | null };
  const entries = new Map<string, SeedEntry>();
  for (const day of PROGRAM) {
    for (const ex of day.exercises) {
      if (!entries.has(ex.name)) entries.set(ex.name, { name: ex.name, lift: ex.lift });
    }
  }
  for (const [lift, names] of Object.entries(EXTRA_BY_LIFT) as [LiftId, string[]][]) {
    for (const name of names) {
      if (!entries.has(name)) entries.set(name, { name, lift });
    }
  }

  const findByName = db.prepare("SELECT id FROM workout_exercises WHERE name = ?");
  const insert = db.prepare(
    `INSERT INTO workout_exercises (name, lift, role, load_mode, rep_mode, e1rm_mode, archived)
     VALUES (?, ?, ?, 'external', 'reps', 'epley', 0)`
  );

  const newIds: number[] = [];
  for (const e of entries.values()) {
    const existing = findByName.get<{ id: number }>(e.name);
    if (existing) continue;
    const role: ExerciseRole = e.lift ? "main" : "accessory";
    const result = insert.run(e.name, e.lift, role);
    newIds.push(Number(result.lastInsertRowid));
  }

  if (newIds.length > 0) {
    // Link each newly inserted exercise to every other exercise of the same
    // lift, in both directions.
    const link = db.prepare(
      "INSERT OR IGNORE INTO workout_exercise_alternatives (exercise_id, alternative_id) VALUES (?, ?)"
    );
    const sameLift = db.prepare(
      "SELECT id FROM workout_exercises WHERE lift = ? AND id != ?"
    );
    const getLift = db.prepare("SELECT lift FROM workout_exercises WHERE id = ?");
    for (const id of newIds) {
      const lift = getLift.get<{ lift: string | null }>(id)?.lift;
      if (!lift) continue;
      for (const other of sameLift.all<{ id: number }>(lift, id)) {
        link.run(id, other.id);
        link.run(other.id, id);
      }
    }
    markDirty(); // the registry is sheet-exported (Exercises tab)
  }
}

function ensureSeeded(): void {
  if (seededThisProcess) return;
  seededThisProcess = true;
  seedExerciseRegistry();
}

// ----- Reads -----

export function listExercises(opts?: { includeArchived?: boolean }): ExerciseDef[] {
  ensureSeeded();
  const where = opts?.includeArchived ? "" : "WHERE archived = 0";
  return getDb()
    .prepare(`SELECT * FROM workout_exercises ${where} ORDER BY name ASC`)
    .all<ExerciseDbRow>()
    .map(mapExercise);
}

export function getExercise(name: string): ExerciseDef | null {
  ensureSeeded();
  const r = getDb()
    .prepare("SELECT * FROM workout_exercises WHERE name = ?")
    .get<ExerciseDbRow>(name);
  return r ? mapExercise(r) : null;
}

export function getExerciseById(id: number): ExerciseDef | null {
  ensureSeeded();
  const r = getDb()
    .prepare("SELECT * FROM workout_exercises WHERE id = ?")
    .get<ExerciseDbRow>(id);
  return r ? mapExercise(r) : null;
}

// Names of all (non-archived is NOT filtered — history must keep counting
// archived movements) exercises belonging to a lift.
export function getRegistryExercisesForLift(lift: LiftId): string[] {
  ensureSeeded();
  return getDb()
    .prepare("SELECT name FROM workout_exercises WHERE lift = ? ORDER BY name ASC")
    .all<{ name: string }>(lift)
    .map((r) => r.name);
}

// Swap suggestions for an exercise: its non-archived registry alternatives.
// Unknown names get none (the swap UI falls back to free-text entry).
export function getAlternativesFor(exerciseName: string): string[] {
  ensureSeeded();
  return getDb()
    .prepare(
      `SELECT alt.name FROM workout_exercise_alternatives a
         JOIN workout_exercises ex ON ex.id = a.exercise_id
         JOIN workout_exercises alt ON alt.id = a.alternative_id
       WHERE ex.name = ? AND alt.archived = 0
       ORDER BY alt.name ASC`
    )
    .all<{ name: string }>(exerciseName)
    .map((r) => r.name);
}

export function getAlternativeIds(exerciseId: number): number[] {
  ensureSeeded();
  return getDb()
    .prepare(
      "SELECT alternative_id FROM workout_exercise_alternatives WHERE exercise_id = ? ORDER BY alternative_id ASC"
    )
    .all<{ alternative_id: number }>(exerciseId)
    .map((r) => r.alternative_id);
}

// True when the exercise name is referenced by logged data (sets, swaps or
// notes). Rename is blocked in that case: set rows and sheet _keys embed the
// name, and a partial rename would silently orphan history.
export function isExerciseReferenced(name: string): boolean {
  const db = getDb();
  const q = (sql: string, ...args: string[]) =>
    (db.prepare(sql).get<{ n: number }>(...args)?.n ?? 0) > 0;
  return (
    q("SELECT COUNT(*) AS n FROM workout_sets WHERE exercise = ?", name) ||
    q(
      "SELECT COUNT(*) AS n FROM workout_swaps WHERE original_exercise = ? OR replacement_exercise = ?",
      name,
      name
    ) ||
    q("SELECT COUNT(*) AS n FROM workout_notes WHERE exercise = ?", name)
  );
}

// ----- Mutations (all markDirty — the registry is sheet-exported) -----

export interface ExerciseInput {
  name: string;
  lift: LiftId | null;
  role: ExerciseRole;
  loadMode: LoadMode;
  repMode: RepMode;
  e1rmMode: E1rmMode;
}

function validateInput(input: ExerciseInput): void {
  if (!input.name.trim()) throw new Error("name is required");
  if (!ROLES.includes(input.role)) throw new Error("invalid role");
  if (!LOAD_MODES.includes(input.loadMode)) throw new Error("invalid load_mode");
  if (!REP_MODES.includes(input.repMode)) throw new Error("invalid rep_mode");
  if (!E1RM_MODES.includes(input.e1rmMode)) throw new Error("invalid e1rm_mode");
}

export function createExercise(input: ExerciseInput): ExerciseDef {
  ensureSeeded();
  validateInput(input);
  const db = getDb();
  const name = input.name.trim();
  if (db.prepare("SELECT id FROM workout_exercises WHERE name = ?").get(name)) {
    throw new Error(`exercise "${name}" already exists`);
  }
  const result = db
    .prepare(
      `INSERT INTO workout_exercises (name, lift, role, load_mode, rep_mode, e1rm_mode, archived)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    )
    .run(name, input.lift, input.role, input.loadMode, input.repMode, input.e1rmMode);
  markDirty();
  return getExerciseById(Number(result.lastInsertRowid))!;
}

export class RenameBlockedError extends Error {
  constructor(name: string) {
    super(
      `"${name}" is referenced by logged sets, swaps or notes — rename is blocked; archive it and create a new exercise instead`
    );
    this.name = "RenameBlockedError";
  }
}

export function updateExercise(id: number, input: ExerciseInput): ExerciseDef {
  ensureSeeded();
  validateInput(input);
  const db = getDb();
  const current = getExerciseById(id);
  if (!current) throw new Error("exercise not found");
  const name = input.name.trim();
  if (name !== current.name) {
    if (isExerciseReferenced(current.name)) throw new RenameBlockedError(current.name);
    const clash = db
      .prepare("SELECT id FROM workout_exercises WHERE name = ? AND id != ?")
      .get(name, id);
    if (clash) throw new Error(`exercise "${name}" already exists`);
  }
  db.prepare(
    `UPDATE workout_exercises
        SET name = ?, lift = ?, role = ?, load_mode = ?, rep_mode = ?, e1rm_mode = ?
      WHERE id = ?`
  ).run(name, input.lift, input.role, input.loadMode, input.repMode, input.e1rmMode, id);
  markDirty();
  return getExerciseById(id)!;
}

export function setExerciseArchived(id: number, archived: boolean): ExerciseDef {
  ensureSeeded();
  if (!getExerciseById(id)) throw new Error("exercise not found");
  getDb()
    .prepare("UPDATE workout_exercises SET archived = ? WHERE id = ?")
    .run(archived ? 1 : 0, id);
  markDirty();
  return getExerciseById(id)!;
}

// Replace the exercise's allowed-swaps list. Links are kept symmetric: the
// old links are removed in both directions, the new ones written in both.
export function setAlternatives(exerciseId: number, alternativeIds: number[]): void {
  ensureSeeded();
  const db = getDb();
  if (!getExerciseById(exerciseId)) throw new Error("exercise not found");
  db.prepare(
    "DELETE FROM workout_exercise_alternatives WHERE exercise_id = ? OR alternative_id = ?"
  ).run(exerciseId, exerciseId);
  const link = db.prepare(
    "INSERT OR IGNORE INTO workout_exercise_alternatives (exercise_id, alternative_id) VALUES (?, ?)"
  );
  for (const altId of alternativeIds) {
    if (altId === exerciseId) continue;
    if (!getExerciseById(altId)) continue;
    link.run(exerciseId, altId);
    link.run(altId, exerciseId);
  }
  markDirty();
}
