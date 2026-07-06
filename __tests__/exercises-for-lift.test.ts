import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let testRoot: string;

// node:sqlite-backed modules read WORKOUT_DB_PATH lazily on first getDb().
// Set it before any dynamic import below.
beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "exercises-for-lift-"));
  process.env.WORKOUT_DB_PATH = join(testRoot, "workout.db");
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
  delete process.env.WORKOUT_DB_PATH;
});

beforeEach(async () => {
  const { getDb } = await import("@/lib/workout-db");
  const db = getDb();
  for (const t of ["workout_sets", "workout_swaps", "workout_sessions"]) {
    db.exec(`DELETE FROM ${t}`);
  }
});

describe("getExercisesForLift", () => {
  // Invariant (roadmap 1.1): for every lift the helper returns a non-empty,
  // disjoint set covering all lift != null program exercises. A program change
  // that breaks this must fail here, not silently merge the history charts.
  it("returns a non-empty set for every lift", async () => {
    const { getExercisesForLift, LIFTS } = await import("@/lib/workout");
    for (const l of LIFTS) {
      expect(getExercisesForLift(l.id).length, l.id).toBeGreaterThan(0);
    }
  });

  it("sets are disjoint across lifts", async () => {
    const { getExercisesForLift, LIFTS } = await import("@/lib/workout");
    const seen = new Map<string, string>();
    for (const l of LIFTS) {
      for (const name of getExercisesForLift(l.id)) {
        expect(seen.get(name), `${name} in both ${seen.get(name)} and ${l.id}`).toBeUndefined();
        seen.set(name, l.id);
      }
    }
  });

  it("covers every program exercise with a non-null lift", async () => {
    const { getExercisesForLift, LIFTS } = await import("@/lib/workout");
    const { PROGRAM } = await import("@/lib/workout-program");
    const covered = new Set(LIFTS.flatMap((l) => getExercisesForLift(l.id)));
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        if (ex.lift !== null) expect(covered.has(ex.name), ex.name).toBe(true);
      }
    }
  });

  it("a swapped-in exercise inherits the original's lift", async () => {
    const { getExercisesForLift, createSwap, LIFTS } = await import("@/lib/workout");
    const original = getExercisesForLift(LIFTS[0].id)[0];
    createSwap(original, "Totally Custom Movement", "day", 1, 1, null);
    expect(getExercisesForLift(LIFTS[0].id)).toContain("Totally Custom Movement");
    // ...and only that lift
    for (const l of LIFTS.slice(1)) {
      expect(getExercisesForLift(l.id)).not.toContain("Totally Custom Movement");
    }
  });
});

describe("getE1rmHistory", () => {
  it("returns distinct series per lift", async () => {
    const { getE1rmHistory, getExercisesForLift, logSet } = await import("@/lib/workout");

    const squatEx = getExercisesForLift("squat")[0];
    const benchEx = getExercisesForLift("bench")[0];
    logSet({ week: 1, day: 1, exercise: squatEx, setNumber: 1, actualWeight: 150, actualReps: 5 });
    logSet({ week: 1, day: 1, exercise: benchEx, setNumber: 1, actualWeight: 100, actualReps: 5 });

    const squatHistory = getE1rmHistory("squat");
    const benchHistory = getE1rmHistory("bench");
    const dlHistory = getE1rmHistory("deadlift");

    expect(squatHistory.length).toBe(1);
    expect(benchHistory.length).toBe(1);
    expect(dlHistory.length).toBe(0);
    expect(squatHistory[0].e1rm).not.toBe(benchHistory[0].e1rm);
  });

  it("excludes accessories (lift = null) from every series", async () => {
    const { getE1rmHistory, logSet, LIFTS } = await import("@/lib/workout");
    const { PROGRAM } = await import("@/lib/workout-program");
    const accessory = PROGRAM[0].exercises.find((e) => e.lift === null);
    if (!accessory) return;
    logSet({ week: 1, day: 1, exercise: accessory.name, setNumber: 1, actualWeight: 60, actualReps: 10 });
    for (const l of LIFTS) {
      expect(getE1rmHistory(l.id).length).toBe(0);
    }
  });
});
