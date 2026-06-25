import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getWarmup } from "../lib/warmup-routines";
import WarmupChecklist from "../components/workout/warmup-checklist";
import { PROGRAM } from "../lib/workout-program";

const DAY_LABELS = ["Squat Focus", "Bench Focus", "Press Focus", "Deadlift Focus"];

describe("getWarmup", () => {
  it("returns a non-empty array for each of the 4 day labels", () => {
    for (const label of DAY_LABELS) {
      const drills = getWarmup(label);
      expect(Array.isArray(drills)).toBe(true);
      expect(drills.length).toBeGreaterThan(0);
      for (const d of drills) {
        expect(typeof d.name).toBe("string");
        expect(d.name.length).toBeGreaterThan(0);
        expect(typeof d.reps).toBe("string");
        expect(d.reps.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns [] for an unknown label (graceful)", () => {
    expect(getWarmup("Cardio Focus")).toEqual([]);
    expect(getWarmup("")).toEqual([]);
  });

  it("covers every label used in the actual program", () => {
    const programLabels = new Set(PROGRAM.map((d) => d.label));
    for (const label of programLabels) {
      expect(getWarmup(label).length).toBeGreaterThan(0);
    }
  });
});

describe("WarmupChecklist render", () => {
  it("renders the warmup section header for each day type", () => {
    for (const label of DAY_LABELS) {
      const drills = getWarmup(label);
      const html = renderToStaticMarkup(createElement(WarmupChecklist, { drills }));
      expect(html).toContain(`Warm-up · ${drills.length} drills`);
    }
  });

  it("renders nothing when there are no drills", () => {
    const html = renderToStaticMarkup(createElement(WarmupChecklist, { drills: [] }));
    expect(html).toBe("");
  });
});
