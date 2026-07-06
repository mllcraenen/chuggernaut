import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getWarmupForDay,
  liftsForDay,
  GENERAL_WARMUP,
  LIFT_WARMUPS,
} from "../lib/warmup-routines";
import WarmupChecklist from "../components/workout/warmup-checklist";
import { PROGRAM } from "../lib/workout-program";

describe("getWarmupForDay", () => {
  // Invariant (design principle 2): a program change must never silently
  // disable warmups — every program day yields at least one drill.
  it("yields at least one drill for every program day", () => {
    for (const day of PROGRAM) {
      const drills = getWarmupForDay(day);
      expect(drills.length, `W${day.week}D${day.day}`).toBeGreaterThan(0);
      for (const d of drills) {
        expect(typeof d.name).toBe("string");
        expect(d.name.length).toBeGreaterThan(0);
        expect(typeof d.reps).toBe("string");
        expect(d.reps.length).toBeGreaterThan(0);
      }
    }
  });

  it("is exactly the general block plus one block per distinct lift", () => {
    for (const day of PROGRAM) {
      const expected = [
        ...GENERAL_WARMUP,
        ...liftsForDay(day).flatMap((l) => LIFT_WARMUPS[l]),
      ];
      expect(getWarmupForDay(day)).toEqual(expected);
    }
  });

  it("derives lifts from exercise structure, not labels", () => {
    for (const day of PROGRAM) {
      const structuralLifts = new Set(
        day.exercises.map((e) => e.lift).filter((l) => l !== null)
      );
      expect(new Set(liftsForDay(day))).toEqual(structuralLifts);
    }
  });

  it("every lift has a non-empty warmup block", () => {
    for (const drills of Object.values(LIFT_WARMUPS)) {
      expect(drills.length).toBeGreaterThan(0);
    }
  });
});

describe("WarmupChecklist render", () => {
  it("renders the warmup section header for each program day", () => {
    for (const day of PROGRAM) {
      const drills = getWarmupForDay(day);
      const html = renderToStaticMarkup(createElement(WarmupChecklist, { drills }));
      expect(html).toContain(`Warm-up · ${drills.length} drills`);
    }
  });

  it("renders nothing when there are no drills", () => {
    const html = renderToStaticMarkup(createElement(WarmupChecklist, { drills: [] }));
    expect(html).toBe("");
  });
});
