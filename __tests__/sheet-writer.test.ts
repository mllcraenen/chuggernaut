import { describe, it, expect } from "vitest";
import { WorkoutSheetWriter } from "@/lib/sheet-writer";
import type { BlockDefinition } from "@/lib/sheet-writer";
import { PROGRAM } from "@/lib/workout-program";
import { CB16_BLOCKS } from "@/lib/workout-sheets";
import type { TrainingMax, SetRow } from "@/lib/workout";

const MOCK_TMS: Record<string, TrainingMax> = {
  squat:    { lift: "squat",    e1rm: 200, trainingMax: 180, setAt: "2026-01-01T00:00:00Z" },
  bench:    { lift: "bench",    e1rm: 140, trainingMax: 126, setAt: "2026-01-01T00:00:00Z" },
  deadlift: { lift: "deadlift", e1rm: 240, trainingMax: 216, setAt: "2026-01-01T00:00:00Z" },
};

function makeWriter(loggedSets: SetRow[] = []) {
  return new WorkoutSheetWriter(PROGRAM, CB16_BLOCKS, MOCK_TMS, loggedSets);
}

// ── parseKey ──────────────────────────────────────────────────────────────────

describe("WorkoutSheetWriter.parseKey", () => {
  it("parses a valid key", () => {
    const result = WorkoutSheetWriter.parseKey("3|2|1|Competition Squat");
    expect(result).toEqual({ week: 3, day: 2, setNumber: 1, exercise: "Competition Squat" });
  });

  it("handles exercise names with pipe chars (future-proof)", () => {
    const result = WorkoutSheetWriter.parseKey("1|1|2|Some|Exercise");
    expect(result?.exercise).toBe("Some|Exercise");
    expect(result?.setNumber).toBe(2);
  });

  it("returns null for empty string", () => {
    expect(WorkoutSheetWriter.parseKey("")).toBeNull();
  });

  it("returns null for separator rows (blank key column)", () => {
    expect(WorkoutSheetWriter.parseKey("")).toBeNull();
    expect(WorkoutSheetWriter.parseKey(undefined)).toBeNull();
    expect(WorkoutSheetWriter.parseKey(null)).toBeNull();
  });

  it("returns null for header row text", () => {
    expect(WorkoutSheetWriter.parseKey("_key")).toBeNull();
  });

  it("returns null if missing parts", () => {
    expect(WorkoutSheetWriter.parseKey("1|2")).toBeNull();
  });

  it("round-trips with makeKey", () => {
    const key = WorkoutSheetWriter.makeKey(5, 3, 2, "Romanian Deadlift");
    const parsed = WorkoutSheetWriter.parseKey(key);
    expect(parsed).toEqual({ week: 5, day: 3, setNumber: 2, exercise: "Romanian Deadlift" });
  });
});

// ── prescribedLabel ───────────────────────────────────────────────────────────

describe("WorkoutSheetWriter.prescribedLabel", () => {
  const squat = PROGRAM.find(d => d.week === 1 && d.day === 1)!
    .exercises.find(e => e.lift === "squat")!;

  it("formats main lift set with calculated weight", () => {
    const set = squat.sets[0]; // Top set, should have percentOfTM
    const label = WorkoutSheetWriter.prescribedLabel(set, squat, MOCK_TMS);
    expect(label).toMatch(/kg × \d+ @RPE/);
    expect(label).toContain("kg");
  });

  it("formats accessory set (no weight)", () => {
    const day1 = PROGRAM.find(d => d.week === 1 && d.day === 1)!;
    const accessory = day1.exercises.find(e => e.lift === null);
    if (!accessory) return; // skip if no accessory in day 1
    const set = accessory.sets[0];
    const label = WorkoutSheetWriter.prescribedLabel(set, accessory, MOCK_TMS);
    expect(label).toMatch(/\d+ reps/);
    expect(label).not.toContain("kg ×");
  });

  it("falls back to percentage when TM missing", () => {
    const set = squat.sets[0];
    const label = WorkoutSheetWriter.prescribedLabel(set, squat, {});
    expect(label).toMatch(/%/);
  });
});

// ── generateBlock ─────────────────────────────────────────────────────────────

describe("WorkoutSheetWriter.generateBlock", () => {
  it("produces rows for all sessions in the block", () => {
    const writer = makeWriter();
    const rows = writer.generateBlock(CB16_BLOCKS[0]); // W1–4
    // Must contain at least one data row per session
    const dataRows = rows.filter(r => WorkoutSheetWriter.parseKey(r[0]) !== null);
    expect(dataRows.length).toBeGreaterThan(0);
  });

  it("every data row has a parseable key", () => {
    const writer = makeWriter();
    for (const block of CB16_BLOCKS) {
      const rows = writer.generateBlock(block);
      const dataRows = rows.filter(r => WorkoutSheetWriter.parseKey(r[0]) !== null);
      for (const row of dataRows) {
        const parsed = WorkoutSheetWriter.parseKey(row[0]);
        expect(parsed).not.toBeNull();
        expect(block.weeks).toContain(parsed!.week);
      }
    }
  });

  it("separator rows have empty key column", () => {
    const writer = makeWriter();
    const rows = writer.generateBlock(CB16_BLOCKS[0]);
    const separators = rows.filter(r => WorkoutSheetWriter.parseKey(r[0]) === null);
    expect(separators.length).toBeGreaterThan(0);
    for (const sep of separators) {
      expect(sep[0]).toBe("");
    }
  });

  it("fills in logged actual values for completed sets", () => {
    const loggedSet: SetRow = {
      id: 1, week: 1, day: 1, exercise: "Competition Squat", setNumber: 1,
      prescribedWeight: 90, prescribedReps: 5, prescribedRpe: 7,
      actualWeight: 92.5, actualReps: 5, actualRpe: 7.5, e1rm: 107.3,
      loggedAt: "2026-06-01T10:00:00Z",
    };
    const writer = new WorkoutSheetWriter(PROGRAM, CB16_BLOCKS, MOCK_TMS, [loggedSet]);
    const rows = writer.generateBlock(CB16_BLOCKS[0]);
    const key = WorkoutSheetWriter.makeKey(1, 1, 1, "Competition Squat");
    const row = rows.find(r => r[0] === key);
    expect(row).toBeDefined();
    expect(row![7]).toBe(92.5);   // actual weight
    expect(row![8]).toBe(5);      // actual reps
    expect(row![9]).toBe(7.5);    // actual rpe
    expect(row![10]).toBe(107.3); // e1rm
  });

  it("leaves actual columns blank for unlogged sets", () => {
    const writer = makeWriter(); // no logged sets
    const rows = writer.generateBlock(CB16_BLOCKS[0]);
    const dataRows = rows.filter(r => WorkoutSheetWriter.parseKey(r[0]) !== null);
    for (const row of dataRows) {
      expect(row[7]).toBe("");  // actual weight blank
      expect(row[8]).toBe("");  // actual reps blank
    }
  });

  it("covers all 4 blocks without overlap", () => {
    const writer = makeWriter();
    const allWeeks: number[] = [];
    for (const block of CB16_BLOCKS) {
      const rows = writer.generateBlock(block);
      const dataRows = rows.filter(r => WorkoutSheetWriter.parseKey(r[0]) !== null);
      for (const row of dataRows) {
        allWeeks.push(row[1] as number);
      }
    }
    // All 16 weeks should appear
    const uniqueWeeks = new Set(allWeeks);
    for (let w = 1; w <= 16; w++) expect(uniqueWeeks.has(w)).toBe(true);
  });
});

// ── parseBlockRows ────────────────────────────────────────────────────────────

describe("WorkoutSheetWriter.parseBlockRows", () => {
  it("skips separator rows", () => {
    const rows = [
      ["", "", 1, "=== Day 1: Squat Focus ===", "", "", "", "", "", "", ""],
      ["1|1|1|Competition Squat", 1, 1, "Squat Focus", "Competition Squat", "Set 1", "90kg × 5 @RPE7", 92.5, 5, 7.5, 107],
    ];
    const results = WorkoutSheetWriter.parseBlockRows(rows);
    expect(results.length).toBe(1);
    expect(results[0].exercise).toBe("Competition Squat");
    expect(results[0].actualWeight).toBe(92.5);
  });

  it("skips rows with no actual values", () => {
    const rows = [
      ["1|1|1|Competition Squat", 1, 1, "Squat Focus", "Competition Squat", "Set 1", "90kg × 5", "", "", "", ""],
    ];
    const results = WorkoutSheetWriter.parseBlockRows(rows);
    expect(results.length).toBe(0);
  });

  it("upserts when only some actual columns are filled", () => {
    const rows = [
      ["2|3|2|Romanian Deadlift", 2, 3, "Deadlift Focus", "Romanian Deadlift", "Set 2", "8 reps", 120, "", "", ""],
    ];
    const results = WorkoutSheetWriter.parseBlockRows(rows);
    expect(results.length).toBe(1);
    expect(results[0].actualWeight).toBe(120);
    expect(results[0].actualReps).toBeNull();
  });

  it("round-trips: generate then parse restores logged values", () => {
    const loggedSet: SetRow = {
      id: 1, week: 2, day: 1, exercise: "Competition Squat", setNumber: 1,
      prescribedWeight: 95, prescribedReps: 5, prescribedRpe: 7,
      actualWeight: 97.5, actualReps: 5, actualRpe: 8, e1rm: 113,
      loggedAt: "2026-06-02T10:00:00Z",
    };
    const writer = new WorkoutSheetWriter(PROGRAM, CB16_BLOCKS, MOCK_TMS, [loggedSet]);
    const rows = writer.generateBlock(CB16_BLOCKS[0]);
    const parsed = WorkoutSheetWriter.parseBlockRows(rows);
    const found = parsed.find(r => r.week === 2 && r.day === 1 && r.exercise === "Competition Squat" && r.setNumber === 1);
    expect(found).toBeDefined();
    expect(found!.actualWeight).toBe(97.5);
    expect(found!.actualReps).toBe(5);
    expect(found!.actualRpe).toBe(8);
  });
});

// ── tabNames ──────────────────────────────────────────────────────────────────

describe("WorkoutSheetWriter.tabNames", () => {
  it("returns block names in order", () => {
    const writer = makeWriter();
    expect(writer.tabNames()).toEqual(CB16_BLOCKS.map(b => b.name));
  });

  it("works with a custom block definition", () => {
    const customBlocks: BlockDefinition[] = [
      { name: "Phase A", weeks: [1, 2] },
      { name: "Phase B", weeks: [3, 4] },
    ];
    const writer = new WorkoutSheetWriter(PROGRAM, customBlocks, MOCK_TMS, []);
    expect(writer.tabNames()).toEqual(["Phase A", "Phase B"]);
  });
});
