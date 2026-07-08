// Bodyweight-aware e1RM + load-mode validation (roadmap 3.4, decision D3).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let testRoot: string;

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "bodyweight-e1rm-"));
  process.env.WORKOUT_DB_PATH = join(testRoot, "workout.db");

  const reg = await import("@/lib/exercise-registry");
  reg.createExercise({
    name: "BW Pull-up", lift: null, role: "accessory",
    loadMode: "bodyweight", repMode: "reps", e1rmMode: "bodyweight_epley",
  });
  reg.createExercise({
    name: "Assisted Dip", lift: null, role: "accessory",
    loadMode: "assisted", repMode: "reps", e1rmMode: "bodyweight_epley",
  });
  reg.createExercise({
    name: "Timed Plank", lift: null, role: "accessory",
    loadMode: "bodyweight", repMode: "time", e1rmMode: "none",
  });
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
  delete process.env.WORKOUT_DB_PATH;
});

describe("computeSetE1rm", () => {
  it("uses body weight + external weight for bodyweight_epley", async () => {
    const w = await import("@/lib/workout");
    w.logBodyWeight("2026-07-01", 80);
    // effective 80 + 20 = 100 → Epley(100, 5) = 116.7
    expect(w.computeSetE1rm("BW Pull-up", 20, 5)).toBe(116.7);
    // pure bodyweight set
    expect(w.computeSetE1rm("BW Pull-up", 0, 5)).toBe(w.epley1rm(80, 5));
  });

  it("supports negative (assistance) weight for assisted exercises", async () => {
    const w = await import("@/lib/workout");
    // effective 80 − 20 = 60
    expect(w.computeSetE1rm("Assisted Dip", -20, 5)).toBe(w.epley1rm(60, 5));
  });

  it("uses the body weight at the session date, not the latest overall", async () => {
    const w = await import("@/lib/workout");
    w.logBodyWeight("2026-07-05", 90);
    expect(w.computeSetE1rm("BW Pull-up", 0, 5, "2026-07-02")).toBe(w.epley1rm(80, 5));
    expect(w.computeSetE1rm("BW Pull-up", 0, 5, "2026-07-06")).toBe(w.epley1rm(90, 5));
    w.deleteBodyWeight("2026-07-05");
  });

  it("returns null when no body weight is logged on/before the date", async () => {
    const w = await import("@/lib/workout");
    expect(w.computeSetE1rm("BW Pull-up", 20, 5, "2020-01-01")).toBeNull();
  });

  it("returns null for e1rm_mode none and timed exercises", async () => {
    const w = await import("@/lib/workout");
    expect(w.computeSetE1rm("Timed Plank", 0, 45)).toBeNull();
  });

  it("falls back to plain Epley for unknown exercises", async () => {
    const w = await import("@/lib/workout");
    expect(w.computeSetE1rm("Unknown Movement", 100, 5)).toBe(w.epley1rm(100, 5));
    expect(w.computeSetE1rm("Unknown Movement", -10, 5)).toBeNull();
  });
});

describe("validateSetWeight", () => {
  it("rejects negative weight for external exercises", async () => {
    const w = await import("@/lib/workout");
    expect(w.validateSetWeight("Unknown Movement", -1)).not.toBeNull();
    expect(w.validateSetWeight("Unknown Movement", 0)).toBeNull();
  });

  it("allows negative weight for assisted exercises while bw + w > 0", async () => {
    const w = await import("@/lib/workout");
    expect(w.validateSetWeight("Assisted Dip", -20)).toBeNull();
    expect(w.validateSetWeight("Assisted Dip", -80)).not.toBeNull(); // bw 80 → effective 0
  });

  it("rejects negative bodyweight-mode weight (only assisted may go negative)", async () => {
    const w = await import("@/lib/workout");
    expect(w.validateSetWeight("BW Pull-up", -5)).not.toBeNull();
  });
});

describe("logSet integration", () => {
  it("stores the bodyweight-aware e1RM on the set row", async () => {
    const w = await import("@/lib/workout");
    const row = w.logSet({
      week: 1, day: 1, exercise: "Assisted Dip", setNumber: 1,
      actualWeight: -20, actualReps: 5,
    });
    expect(row.e1rm).toBe(w.epley1rm(60, 5));
    expect(row.actualWeight).toBe(-20);
  });

  it("timed sets store seconds in reps with a null e1RM", async () => {
    const w = await import("@/lib/workout");
    const row = w.logSet({
      week: 1, day: 1, exercise: "Timed Plank", setNumber: 1,
      actualWeight: 0, actualReps: 45,
    });
    expect(row.e1rm).toBeNull();
    expect(row.actualReps).toBe(45);
  });
});
