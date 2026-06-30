import { describe, it, expect } from "vitest";
import {
  rpeLoadFactor,
  impliedTm,
  computeSessionAdjustments,
  type AutoregSet,
} from "../lib/autoregulation";
import type { LiftId, TrainingMax } from "../lib/workout";

function tm(lift: LiftId, trainingMax: number): TrainingMax {
  return { lift, e1rm: Math.round((trainingMax / 0.9) * 10) / 10, trainingMax, setAt: "2026-06-28T00:00:00Z" };
}

function set(partial: Partial<AutoregSet>): AutoregSet {
  return {
    lift: "squat",
    setNumber: 1,
    prescribedPercent: 80,
    prescribedRpe: 8,
    actualWeight: 80,
    actualReps: 5,
    actualRpe: 8,
    ...partial,
  };
}

describe("rpeLoadFactor", () => {
  it("returns the table value for integer reps/RPE", () => {
    expect(rpeLoadFactor(5, 8)).toBe(0.85);
    expect(rpeLoadFactor(1, 10)).toBe(1.0);
  });

  it("interpolates fractional RPE", () => {
    // halfway between RPE 7 (0.82) and 8 (0.85) for 5 reps
    expect(rpeLoadFactor(5, 7.5)).toBeCloseTo(0.835, 5);
  });

  it("clamps reps and RPE out of range without throwing", () => {
    expect(() => rpeLoadFactor(15, 8)).not.toThrow();
    expect(rpeLoadFactor(15, 8)).toBe(rpeLoadFactor(10, 8));
    expect(rpeLoadFactor(0, 8)).toBe(rpeLoadFactor(1, 8));
    expect(rpeLoadFactor(5, 11)).toBe(rpeLoadFactor(5, 10));
    expect(rpeLoadFactor(5, 3)).toBe(rpeLoadFactor(5, 6));
  });
});

describe("impliedTm", () => {
  it("same actual/prescribed RPE → weight / (pct/100), no change", () => {
    // 100kg at 80% → 100 / 0.8 = 125
    expect(impliedTm(100, 5, 8, 8, 80)).toBe(125);
  });

  it("actualRpe > prescribedRpe → lower implied TM (too heavy)", () => {
    const noChange = impliedTm(100, 5, 8, 8, 80);
    expect(impliedTm(100, 5, 9, 8, 80)).toBeLessThan(noChange);
  });

  it("actualRpe < prescribedRpe → higher implied TM (too light)", () => {
    const noChange = impliedTm(100, 5, 8, 8, 80);
    expect(impliedTm(100, 5, 7, 8, 80)).toBeGreaterThan(noChange);
  });

  it("reps outside 1-10 clamp without throwing", () => {
    expect(() => impliedTm(100, 15, 8, 8, 80)).not.toThrow();
    expect(Number.isFinite(impliedTm(100, 15, 8, 8, 80))).toBe(true);
  });

  it("RPE outside 6-10 clamp without throwing", () => {
    expect(() => impliedTm(100, 5, 11, 8, 80)).not.toThrow();
    expect(Number.isFinite(impliedTm(100, 5, 11, 8, 80))).toBe(true);
  });

  it("rounds to the nearest 0.5", () => {
    const v = impliedTm(80, 5, 6, 8, 80);
    expect(v * 2).toBe(Math.round(v * 2));
  });
});

describe("computeSessionAdjustments", () => {
  const tms = { squat: tm("squat", 100) };

  it("empty sets → []", () => {
    expect(computeSessionAdjustments([], tms)).toEqual([]);
  });

  it("sets without RPE data → []", () => {
    const sets = [set({ actualRpe: null }), set({ prescribedRpe: null, setNumber: 2 })];
    expect(computeSessionAdjustments(sets, tms)).toEqual([]);
  });

  it("no current TM for the lift → []", () => {
    const sets = [set({ actualRpe: 6 })];
    expect(computeSessionAdjustments(sets, {})).toEqual([]);
  });

  it("single set per lift → returns a suggestion", () => {
    // set felt easy (RPE 6 vs prescribed 8) → TM nudged up
    const sets = [set({ actualRpe: 6 })];
    const result = computeSessionAdjustments(sets, tms);
    expect(result).toHaveLength(1);
    expect(result[0].lift).toBe("squat");
    expect(result[0].currentTm).toBe(100);
    expect(result[0].suggestedTm).toBe(104.5);
    expect(result[0].deltaKg).toBe(4.5);
    expect(result[0].setsUsed).toBe(1);
  });

  it("delta < 1% → filtered out", () => {
    // actual == prescribed RPE → implied == current → no change
    const sets = [set({ actualRpe: 8 })];
    expect(computeSessionAdjustments(sets, tms)).toEqual([]);
  });

  it("delta > 5% → capped at 5%", () => {
    // big easy gap implies far above current, but capped
    const sets = [
      set({ prescribedPercent: 70, prescribedRpe: 10, actualWeight: 70, actualRpe: 6 }),
    ];
    const result = computeSessionAdjustments(sets, tms);
    expect(result).toHaveLength(1);
    expect(result[0].suggestedTm).toBe(105);
    expect(Math.abs(result[0].deltaKg)).toBeLessThanOrEqual(5);
    expect(result[0].deltaPct).toBe(5);
  });

  it("top set (setNumber 1) weighted 2× vs back-off sets", () => {
    const sets = [
      set({ setNumber: 1, actualRpe: 7 }), // implies 103.5
      set({ setNumber: 2, actualRpe: 8 }), // implies 100 (no change)
    ];
    const result = computeSessionAdjustments(sets, tms);
    expect(result).toHaveLength(1);
    // weighted (103.5*2 + 100)/3 = 102.333 → damped 101.5
    // a 1:1 average would give 101.0 — so 101.5 proves the 2× weighting
    expect(result[0].suggestedTm).toBe(101.5);
    expect(result[0].setsUsed).toBe(2);
  });

  it("accessory sets (lift null) are ignored", () => {
    const sets = [set({ lift: null, actualRpe: 6 })];
    expect(computeSessionAdjustments(sets, tms)).toEqual([]);
  });
});
