import { describe, it, expect } from "vitest";
import { getAlternatives, liftOfProgramExercise } from "@/lib/exercise-alternatives";
import { PROGRAM } from "@/lib/workout-program";

describe("getAlternatives", () => {
  // Invariant (roadmap 1.5): every main-lift program exercise yields at least
  // one alternative. A program change that empties the swap sheet must fail
  // here instead of silently showing no suggestions.
  it("yields ≥ 1 alternative for every main-lift program exercise", () => {
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        if (ex.lift === null) continue;
        const alts = getAlternatives(ex.name);
        expect(alts.length, ex.name).toBeGreaterThan(0);
        expect(alts).not.toContain(ex.name);
      }
    }
  });

  it("alternatives share the exercise's lift or come from that lift's extra pool", () => {
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        if (ex.lift === null) continue;
        for (const alt of getAlternatives(ex.name)) {
          const altLift = liftOfProgramExercise(alt);
          // Program exercises must match the lift; extras aren't in the program.
          if (altLift !== null) expect(altLift).toBe(ex.lift);
        }
      }
    }
  });

  it("accessories (lift = null) get no suggestions (free-text swap only)", () => {
    for (const day of PROGRAM) {
      for (const ex of day.exercises) {
        if (ex.lift === null) {
          expect(getAlternatives(ex.name)).toEqual([]);
        }
      }
    }
  });

  it("unknown exercise names get no suggestions", () => {
    expect(getAlternatives("Not A Real Exercise")).toEqual([]);
  });
});
