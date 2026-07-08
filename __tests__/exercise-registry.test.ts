// Exercise registry invariants (roadmap Phase 3).
//
// The registry is the durable fix for the display-string failure class: these
// tests pin (i) program ↔ registry parity — loading a new program must break
// tests, not silently disable features, (ii) the swap-suggestion invariant
// carried over from 1.5, and (iii) the rename-safety rule.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let testRoot: string;

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "exercise-registry-"));
  process.env.WORKOUT_DB_PATH = join(testRoot, "workout.db");
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
  delete process.env.WORKOUT_DB_PATH;
});

describe("seeding", () => {
  it("is idempotent — reseeding does not duplicate or clobber", async () => {
    const reg = await import("@/lib/exercise-registry");
    reg.seedExerciseRegistry();
    const first = reg.listExercises({ includeArchived: true });
    reg.seedExerciseRegistry();
    const second = reg.listExercises({ includeArchived: true });
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it("program ↔ registry parity: every program exercise exists and its lift matches", async () => {
    const reg = await import("@/lib/exercise-registry");
    const { PROGRAM } = await import("@/lib/workout-program");
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        const def = reg.getExercise(ex.name);
        expect(def, `program exercise "${ex.name}" missing from registry`).not.toBeNull();
        expect(def!.lift, ex.name).toBe(ex.lift);
        expect(def!.role, ex.name).toBe(ex.lift ? "main" : "accessory");
      }
    }
  });

  it("user edits survive reseeding", async () => {
    const reg = await import("@/lib/exercise-registry");
    const { PROGRAM } = await import("@/lib/workout-program");
    const accessory = PROGRAM[0].exercises.find((e) => e.lift === null)!;
    const def = reg.getExercise(accessory.name)!;
    reg.updateExercise(def.id, {
      name: def.name,
      lift: def.lift,
      role: def.role,
      loadMode: "bodyweight",
      repMode: def.repMode,
      e1rmMode: "bodyweight_epley",
    });
    reg.seedExerciseRegistry();
    const after = reg.getExercise(accessory.name)!;
    expect(after.loadMode).toBe("bodyweight");
    expect(after.e1rmMode).toBe("bodyweight_epley");
  });
});

describe("alternatives (swap suggestions)", () => {
  it("every main-lift program exercise yields ≥ 1 alternative (invariant from 1.5)", async () => {
    const reg = await import("@/lib/exercise-registry");
    const { PROGRAM } = await import("@/lib/workout-program");
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        if (ex.lift === null) continue;
        const alts = reg.getAlternativesFor(ex.name);
        expect(alts.length, ex.name).toBeGreaterThan(0);
        expect(alts).not.toContain(ex.name);
      }
    }
  });

  it("seeded alternatives share the exercise's lift", async () => {
    const reg = await import("@/lib/exercise-registry");
    const { PROGRAM } = await import("@/lib/workout-program");
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        if (ex.lift === null) continue;
        for (const alt of reg.getAlternativesFor(ex.name)) {
          expect(reg.getExercise(alt)?.lift, `${ex.name} → ${alt}`).toBe(ex.lift);
        }
      }
    }
  });

  it("accessories get no suggestions (free-text swap only)", async () => {
    const reg = await import("@/lib/exercise-registry");
    const { PROGRAM } = await import("@/lib/workout-program");
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        if (ex.lift === null) expect(reg.getAlternativesFor(ex.name)).toEqual([]);
      }
    }
  });

  it("unknown exercise names get no suggestions", async () => {
    const reg = await import("@/lib/exercise-registry");
    expect(reg.getAlternativesFor("Not A Real Exercise")).toEqual([]);
  });

  it("setAlternatives replaces links symmetrically and archived movements are hidden", async () => {
    const reg = await import("@/lib/exercise-registry");
    const a = reg.createExercise({
      name: "Reg Test A", lift: "squat", role: "main",
      loadMode: "external", repMode: "reps", e1rmMode: "epley",
    });
    const b = reg.createExercise({
      name: "Reg Test B", lift: "squat", role: "main",
      loadMode: "external", repMode: "reps", e1rmMode: "epley",
    });
    reg.setAlternatives(a.id, [b.id]);
    expect(reg.getAlternativesFor("Reg Test A")).toContain("Reg Test B");
    expect(reg.getAlternativesFor("Reg Test B")).toContain("Reg Test A");

    reg.setExerciseArchived(b.id, true);
    expect(reg.getAlternativesFor("Reg Test A")).not.toContain("Reg Test B");

    reg.setAlternatives(a.id, []);
    expect(reg.getAlternativeIds(a.id)).toEqual([]);
  });
});

describe("rename safety", () => {
  it("rename is blocked once the name is referenced by logged sets", async () => {
    const reg = await import("@/lib/exercise-registry");
    const w = await import("@/lib/workout");
    const ex = reg.createExercise({
      name: "Rename Victim", lift: null, role: "accessory",
      loadMode: "external", repMode: "reps", e1rmMode: "epley",
    });
    // Unreferenced: rename works.
    reg.updateExercise(ex.id, { ...ex, name: "Rename Victim 2" });
    expect(reg.getExercise("Rename Victim 2")).not.toBeNull();

    w.logSet({ week: 1, day: 1, exercise: "Rename Victim 2", setNumber: 1, actualWeight: 50, actualReps: 10 });
    expect(() =>
      reg.updateExercise(ex.id, { ...ex, name: "Rename Victim 3" })
    ).toThrow(reg.RenameBlockedError);
    // Non-name edits stay allowed.
    reg.updateExercise(ex.id, { ...ex, name: "Rename Victim 2", loadMode: "bodyweight" });
    expect(reg.getExercise("Rename Victim 2")!.loadMode).toBe("bodyweight");
  });

  it("duplicate names are rejected", async () => {
    const reg = await import("@/lib/exercise-registry");
    const { PROGRAM } = await import("@/lib/workout-program");
    const existing = PROGRAM[0].exercises[0].name;
    expect(() =>
      reg.createExercise({
        name: existing, lift: null, role: "accessory",
        loadMode: "external", repMode: "reps", e1rmMode: "epley",
      })
    ).toThrow(/already exists/);
  });
});

describe("registry mutators mark the sheet dirty", () => {
  it("create / update / archive / setAlternatives all markDirty", async () => {
    const reg = await import("@/lib/exercise-registry");
    const { isDirty, clearDirty } = await import("@/lib/sheets-sync");

    clearDirty();
    const ex = reg.createExercise({
      name: "Dirty Test", lift: null, role: "accessory",
      loadMode: "external", repMode: "reps", e1rmMode: "epley",
    });
    expect(isDirty(), "createExercise").toBe(true);

    clearDirty();
    reg.updateExercise(ex.id, { ...ex, e1rmMode: "none" });
    expect(isDirty(), "updateExercise").toBe(true);

    clearDirty();
    reg.setExerciseArchived(ex.id, true);
    expect(isDirty(), "setExerciseArchived").toBe(true);

    clearDirty();
    reg.setAlternatives(ex.id, []);
    expect(isDirty(), "setAlternatives").toBe(true);
  });
});
