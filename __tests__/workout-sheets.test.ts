import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Mock auth so route handlers can be exercised with / without a session.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

let testRoot: string;

// node:sqlite-backed modules read WORKOUT_DB_PATH lazily on first getDb().
// Set it before any dynamic import below.
beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "workout-sheets-"));
  process.env.WORKOUT_DB_PATH = join(testRoot, "workout.db");
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
  delete process.env.WORKOUT_DB_PATH;
});

// Reset all tables between tests for isolation.
beforeEach(async () => {
  const { getDb } = await import("@/lib/workout-db");
  const db = getDb();
  for (const t of [
    "workout_training_maxes",
    "workout_sessions",
    "workout_sets",
    "workout_settings",
    "workout_swaps",
    "workout_body_weight",
    "workout_notes",
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
});

// ---- Fake Sheets client ----

import {
  TAB_TRAINING_MAXES,
  TAB_BODY_WEIGHT,
  TAB_SWAPS,
  TAB_SESSIONS,
  TAB_SETTINGS,
  TAB_EXERCISES,
  TAB_TM_HISTORY,
  BLOCKS,
} from "@/lib/workout-sheets";
import { WorkoutSheetWriter } from "@/lib/sheet-writer";
import { PROGRAM } from "@/lib/workout-program";

// Program-agnostic fixture: a main-lift exercise from week 1 day 1.
const W1D1_MAIN = PROGRAM.find((d) => d.week === 1 && d.day === 1)!
  .exercises.find((e) => e.lift !== null)!;

// All tabs: program block tabs + bidirectional non-block tabs + export-only tabs
const ALL_TABS = [
  ...BLOCKS.map(b => b.name),
  TAB_TRAINING_MAXES,
  TAB_BODY_WEIGHT,
  TAB_SWAPS,
  TAB_SESSIONS,
  TAB_SETTINGS,
  TAB_EXERCISES,
  TAB_TM_HISTORY,
];

function makeFakeSheets(getData: Record<string, unknown[][]> = {}) {
  const updates: { range: string; values: unknown[][] }[] = [];
  const clears: string[] = [];
  const sheets = {
    spreadsheets: {
      get: vi.fn(async () => ({
        data: { sheets: ALL_TABS.map((title) => ({ properties: { title } })) },
      })),
      batchUpdate: vi.fn(async () => ({})),
      values: {
        clear: vi.fn(async (p: { range: string }) => {
          clears.push(p.range);
          return {};
        }),
        update: vi.fn(async (p: { range: string; requestBody: { values: unknown[][] } }) => {
          updates.push({ range: p.range, values: p.requestBody.values });
          return {};
        }),
        get: vi.fn(async (p: { range: string }) => {
          const tab = p.range.split("!")[0];
          return { data: { values: getData[tab] ?? [] } };
        }),
      },
    },
  };
  return { sheets, updates, clears };
}

// ---- Export (DB -> Sheet) ----

describe("exportToSheet", () => {
  it("writes a header + data row for each tab", async () => {
    const { setTrainingMaxes, logSet } = await import("@/lib/workout");
    const { getDb } = await import("@/lib/workout-db");
    setTrainingMaxes([
      { lift: "squat", e1rm: 180, trainingMax: 162 },
      { lift: "bench", e1rm: 120, trainingMax: 108 },
      { lift: "deadlift", e1rm: 220, trainingMax: 198 },
    ]);
    logSet({ week: 1, day: 1, exercise: W1D1_MAIN.name, setNumber: 1, actualWeight: 100, actualReps: 5 });
    getDb()
      .prepare("INSERT INTO workout_body_weight (date, weight_kg) VALUES (?,?)")
      .run("2026-06-20", 82.5);

    const { exportToSheet } = await import("@/lib/workout-sheets");
    const { sheets, updates, clears } = makeFakeSheets();

    const result = await exportToSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });

    expect(result.ok).toBe(true);
    // Each tab cleared then written.
    expect(clears.length).toBe(ALL_TABS.length);
    expect(updates.length).toBe(ALL_TABS.length);

    const tmUpdate = updates.find((u) => u.range.startsWith(`${TAB_TRAINING_MAXES}!`))!;
    expect(tmUpdate.values[0]).toEqual(["lift", "e1rm", "training_max", "set_at"]);
    expect(tmUpdate.values.length).toBe(1 + 3); // header + 3 lifts
    expect(tmUpdate.values[1][0]).toBe("squat");

    // Block tabs: first row is the writer header, subsequent rows include data + separators
    const block1Update = updates.find((u) => u.range.startsWith(`${BLOCKS[0].name}!`))!;
    expect(block1Update).toBeDefined();
    expect(block1Update.values[0]).toEqual(WorkoutSheetWriter.HEADER);
    // The logged Week 1 Day 1 main-lift set should appear
    const dataRow = block1Update.values.find(r => WorkoutSheetWriter.parseKey(r[0]) !== null && r[4] === W1D1_MAIN.name);
    expect(dataRow).toBeDefined();
    expect(dataRow![7]).toBe(100); // actual weight

    const bwUpdate = updates.find((u) => u.range.startsWith(`${TAB_BODY_WEIGHT}!`))!;
    expect(bwUpdate.values[1]).toEqual(["2026-06-20", 82.5]);

    expect(result.rowsByTab[TAB_TRAINING_MAXES]).toBe(3); // data rows, header excluded
    expect(result.rowsByTab[TAB_BODY_WEIGHT]).toBe(1);
  });

  it("records last sync time in settings", async () => {
    const { exportToSheet } = await import("@/lib/workout-sheets");
    const { getSetting } = await import("@/lib/workout");
    const { sheets } = makeFakeSheets();
    const result = await exportToSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });
    expect(getSetting("sheets_last_sync")).toBe(result.lastSync);
  });

  it("creates missing tabs via batchUpdate", async () => {
    const { exportToSheet } = await import("@/lib/workout-sheets");
    const { sheets } = makeFakeSheets();
    // Pretend the sheet only has the first tab.
    sheets.spreadsheets.get = vi.fn(async () => ({
      data: { sheets: [{ properties: { title: TAB_TRAINING_MAXES } }] },
    }));
    await exportToSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });
    expect(sheets.spreadsheets.batchUpdate).toHaveBeenCalledTimes(1);
  });
});

// ---- Import (Sheet -> DB) ----

describe("importFromSheet", () => {
  it("upserts TM and body weight from non-block tabs", async () => {
    const { importFromSheet } = await import("@/lib/workout-sheets");
    const { getTrainingMaxes } = await import("@/lib/workout");

    const data: Record<string, unknown[][]> = {
      [TAB_TRAINING_MAXES]: [
        ["lift", "e1rm", "training_max", "set_at"],
        ["squat", "180", "162", "2026-06-01T00:00:00Z"],
      ],
      [TAB_BODY_WEIGHT]: [
        ["date", "weight_kg"],
        ["2026-06-20", "82.5"],
      ],
    };
    const { sheets } = makeFakeSheets(data);

    const result = await importFromSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });

    expect(result.ok).toBe(true);
    const tms = getTrainingMaxes();
    expect(tms.squat?.trainingMax).toBe(162);
  });

  it("upserts actual set values from block tab rows", async () => {
    const { importFromSheet } = await import("@/lib/workout-sheets");
    const { getSetsForSession } = await import("@/lib/workout");

    const key = WorkoutSheetWriter.makeKey(1, 1, 1, "Competition Squat");
    const data: Record<string, unknown[][]> = {
      [BLOCKS[0].name]: [
        WorkoutSheetWriter.HEADER,
        [key, 1, 1, "Squat Focus", "Competition Squat", "Set 1 (Top)", "90kg × 5 @RPE7", 92.5, 5, 7.5, 107.3],
      ],
    };
    const { sheets } = makeFakeSheets(data);

    await importFromSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });

    const sets = getSetsForSession(1, 1);
    expect(sets.length).toBe(1);
    expect(sets[0].exercise).toBe("Competition Squat");
    expect(sets[0].actualWeight).toBe(92.5);
    expect(sets[0].actualReps).toBe(5);
  });

  it("is idempotent — re-importing the same block row does not duplicate", async () => {
    const { importFromSheet } = await import("@/lib/workout-sheets");
    const { getSetsForSession } = await import("@/lib/workout");
    const key = WorkoutSheetWriter.makeKey(2, 1, 1, "Competition Bench");
    const data: Record<string, unknown[][]> = {
      [BLOCKS[0].name]: [
        WorkoutSheetWriter.HEADER,
        [key, 2, 1, "Bench Focus", "Competition Bench", "Set 1", "80kg × 5 @RPE7", 82.5, 5, 8, 96],
      ],
    };
    const ctx = { sheets: makeFakeSheets(data).sheets as never, spreadsheetId: "SHEET_ID" };
    await importFromSheet(ctx);
    await importFromSheet(ctx);
    expect(getSetsForSession(2, 1).length).toBe(1);
  });

  it("skips separator rows silently", async () => {
    const { importFromSheet } = await import("@/lib/workout-sheets");
    const { getSetsForSession } = await import("@/lib/workout");
    const data: Record<string, unknown[][]> = {
      [BLOCKS[0].name]: [
        WorkoutSheetWriter.HEADER,
        ["", "", 1, "=== Day 1: Squat Focus ===", "", "", "", "", "", "", ""],
        ["", 1, 1, "Squat Focus", "", "— Week 1 —", "", "", "", "", ""],
      ],
    };
    const { sheets } = makeFakeSheets(data);
    await importFromSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });
    expect(getSetsForSession(1, 1).length).toBe(0);
  });
});

// ---- Notes ↔ sheet (2.2) ----

describe("notes ↔ sheet", () => {
  const NOTES_COL = WorkoutSheetWriter.NOTES_COL;

  it("exports the note on the exercise's first set row", async () => {
    const { setNote } = await import("@/lib/workout");
    setNote(1, 1, W1D1_MAIN.name, "Belt on last set");

    const { exportToSheet } = await import("@/lib/workout-sheets");
    const { sheets, updates } = makeFakeSheets();
    await exportToSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });

    const block1 = updates.find((u) => u.range.startsWith(`${BLOCKS[0].name}!`))!;
    const exRows = block1.values.filter((r) => {
      const p = WorkoutSheetWriter.parseKey(r[0]);
      return p !== null && p.week === 1 && p.day === 1 && p.exercise === W1D1_MAIN.name;
    });
    expect(exRows[0][NOTES_COL]).toBe("Belt on last set");
    for (const r of exRows.slice(1)) expect(r[NOTES_COL]).toBe("");
  });

  it("imports a note from a first-set row, even with no logged actuals (D4)", async () => {
    const { importFromSheet } = await import("@/lib/workout-sheets");
    const { getNote } = await import("@/lib/workout");

    const key = WorkoutSheetWriter.makeKey(1, 1, 1, W1D1_MAIN.name);
    const row = [key, 1, 1, "Day", W1D1_MAIN.name, "Set 1", "90kg × 5", "", "", "", "", "Grip felt off"];
    const data = { [BLOCKS[0].name]: [WorkoutSheetWriter.HEADER, row] };
    const { sheets } = makeFakeSheets(data);
    await importFromSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });

    expect(getNote(1, 1, W1D1_MAIN.name)).toBe("Grip felt off");
  });

  it("an empty note cell clears the stored note (sheet authoritative)", async () => {
    const { setNote, getNote } = await import("@/lib/workout");
    setNote(1, 1, W1D1_MAIN.name, "Stale note");

    const { importFromSheet } = await import("@/lib/workout-sheets");
    const key = WorkoutSheetWriter.makeKey(1, 1, 1, W1D1_MAIN.name);
    const row = [key, 1, 1, "Day", W1D1_MAIN.name, "Set 1", "90kg × 5", 92.5, 5, "", "", ""];
    const data = { [BLOCKS[0].name]: [WorkoutSheetWriter.HEADER, row] };
    const { sheets } = makeFakeSheets(data);
    await importFromSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });

    expect(getNote(1, 1, W1D1_MAIN.name)).toBeNull();
  });

  it("tolerates old sheets without a Notes column — notes untouched", async () => {
    const { setNote, getNote } = await import("@/lib/workout");
    setNote(1, 1, W1D1_MAIN.name, "Preserved note");

    const { importFromSheet } = await import("@/lib/workout-sheets");
    const oldHeader = WorkoutSheetWriter.HEADER.slice(0, NOTES_COL);
    const key = WorkoutSheetWriter.makeKey(1, 1, 1, W1D1_MAIN.name);
    const row = [key, 1, 1, "Day", W1D1_MAIN.name, "Set 1", "90kg × 5", 92.5, 5, "", ""];
    const data = { [BLOCKS[0].name]: [oldHeader, row] };
    const { sheets } = makeFakeSheets(data);
    await importFromSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });

    expect(getNote(1, 1, W1D1_MAIN.name)).toBe("Preserved note");
  });

  it("is lossless: export → wipe → import → export produces identical block tabs", async () => {
    const { setTrainingMaxes, logSet, setNote } = await import("@/lib/workout");
    const { exportToSheet, importFromSheet } = await import("@/lib/workout-sheets");
    const { getDb } = await import("@/lib/workout-db");

    setTrainingMaxes([
      { lift: "squat", e1rm: 180, trainingMax: 162 },
      { lift: "bench", e1rm: 120, trainingMax: 108 },
      { lift: "deadlift", e1rm: 220, trainingMax: 198 },
    ]);
    logSet({ week: 1, day: 1, exercise: W1D1_MAIN.name, setNumber: 1, actualWeight: 100, actualReps: 5, actualRpe: 8 });
    // Extra set beyond the prescription must survive the round-trip too
    logSet({ week: 1, day: 1, exercise: W1D1_MAIN.name, setNumber: 99, actualWeight: 80, actualReps: 8 });
    setNote(1, 1, W1D1_MAIN.name, "Belt on last set");

    const first = makeFakeSheets();
    await exportToSheet({ sheets: first.sheets as never, spreadsheetId: "SID" });
    const firstByTab = Object.fromEntries(first.updates.map((u) => [u.range.split("!")[0], u.values]));

    // Wipe user data, then import everything back from the captured sheet
    for (const t of ["workout_sets", "workout_notes"]) getDb().exec(`DELETE FROM ${t}`);
    const { sheets: importSheets } = makeFakeSheets(firstByTab as Record<string, unknown[][]>);
    await importFromSheet({ sheets: importSheets as never, spreadsheetId: "SID" });

    const second = makeFakeSheets();
    await exportToSheet({ sheets: second.sheets as never, spreadsheetId: "SID" });
    const secondByTab = Object.fromEntries(second.updates.map((u) => [u.range.split("!")[0], u.values]));

    for (const block of BLOCKS) {
      expect(secondByTab[block.name]).toEqual(firstByTab[block.name]);
    }
  });
});

// ---- Exercises tab (Phase 3, export-only) ----

describe("Exercises tab", () => {
  it("exports every registry exercise and skips the tab on import", async () => {
    const { listExercises } = await import("@/lib/exercise-registry");
    const { exportToSheet, importFromSheet } = await import("@/lib/workout-sheets");
    const { getDb } = await import("@/lib/workout-db");

    const { sheets, updates } = makeFakeSheets();
    await exportToSheet({ sheets: sheets as never, spreadsheetId: "SID" });
    const exUpdate = updates.find((u) => u.range.startsWith(`${TAB_EXERCISES}!`))!;
    expect(exUpdate.values[0]).toEqual([
      "name", "lift", "role", "load_mode", "rep_mode", "e1rm_mode", "archived", "alternatives",
    ]);
    const all = listExercises({ includeArchived: true });
    expect(all.length).toBeGreaterThan(0);
    expect(exUpdate.values.length).toBe(1 + all.length);

    // Import must never touch the registry (export-only).
    const before = getDb().prepare("SELECT COUNT(*) AS n FROM workout_exercises").get<{ n: number }>()!.n;
    const data = {
      [TAB_EXERCISES]: [
        exUpdate.values[0],
        ["Sheet Injected Exercise", "squat", "main", "external", "reps", "epley", 0, ""],
      ] as unknown[][],
    };
    const { sheets: impSheets } = makeFakeSheets(data);
    const result = await importFromSheet({ sheets: impSheets as never, spreadsheetId: "SID" });
    expect(result.rowsByTab[TAB_EXERCISES]).toBe(0);
    const after = getDb().prepare("SELECT COUNT(*) AS n FROM workout_exercises").get<{ n: number }>()!.n;
    expect(after).toBe(before);
  });
});

// ---- TM History tab (Phase 4, export-only) ----

describe("TM History tab", () => {
  it("exports every TM event and skips the tab on import", async () => {
    const { getTmEvents, setTrainingMaxes } = await import("@/lib/workout");
    const { exportToSheet, importFromSheet } = await import("@/lib/workout-sheets");
    const { getDb } = await import("@/lib/workout-db");

    // Ensure at least one event exists (a changed manual save records one).
    setTrainingMaxes([{ lift: "squat", e1rm: 200, trainingMax: 176 }]);
    const events = getTmEvents();
    expect(events.length).toBeGreaterThan(0);

    const { sheets, updates } = makeFakeSheets();
    await exportToSheet({ sheets: sheets as never, spreadsheetId: "SID" });
    const tmUpdate = updates.find((u) => u.range.startsWith(`${TAB_TM_HISTORY}!`))!;
    expect(tmUpdate.values[0]).toEqual([
      "date", "lift", "e1rm", "training_max", "source",
      "week", "day", "sets_used", "implied_tm", "damping", "applied",
    ]);
    expect(tmUpdate.values.length).toBe(1 + events.length);

    // Import must never write events (export-only, no _key round-trip risk).
    const before = getDb().prepare("SELECT COUNT(*) AS n FROM workout_tm_events").get<{ n: number }>()!.n;
    const data = {
      [TAB_TM_HISTORY]: [
        tmUpdate.values[0],
        ["2026-01-01T00:00:00Z", "squat", 300, 264, "manual", "", "", "", "", "", 1],
      ] as unknown[][],
    };
    const { sheets: impSheets } = makeFakeSheets(data);
    const result = await importFromSheet({ sheets: impSheets as never, spreadsheetId: "SID" });
    expect(result.rowsByTab[TAB_TM_HISTORY]).toBe(0);
    const after = getDb().prepare("SELECT COUNT(*) AS n FROM workout_tm_events").get<{ n: number }>()!.n;
    expect(after).toBe(before);
  });
});

// ---- Server-side input guards (2.4) ----

describe("input guards", () => {
  it("epley1rm returns null for non-positive weight or reps", async () => {
    const { epley1rm } = await import("@/lib/workout");
    expect(epley1rm(0, 5)).toBeNull();
    expect(epley1rm(-20, 5)).toBeNull();
    expect(epley1rm(100, 0)).toBeNull();
    expect(epley1rm(100, 5)).toBe(116.7);
  });

  it("import skips rows with negative weight or reps < 1", async () => {
    const { importFromSheet } = await import("@/lib/workout-sheets");
    const { getSetsForSession } = await import("@/lib/workout");
    const mk = (n: number) => WorkoutSheetWriter.makeKey(1, 1, n, W1D1_MAIN.name);
    const data = {
      [BLOCKS[0].name]: [
        WorkoutSheetWriter.HEADER,
        [mk(1), 1, 1, "Day", W1D1_MAIN.name, "Set 1", "", -50, 5, "", "", ""],
        [mk(2), 1, 1, "Day", W1D1_MAIN.name, "Set 2", "", 100, 0, "", "", ""],
        [mk(3), 1, 1, "Day", W1D1_MAIN.name, "Set 3", "", 100, 5, "", "", ""],
      ],
    };
    const { sheets } = makeFakeSheets(data);
    await importFromSheet({ sheets: sheets as never, spreadsheetId: "SHEET_ID" });
    const sets = getSetsForSession(1, 1);
    expect(sets.length).toBe(1);
    expect(sets[0].setNumber).toBe(3);
  });
});

// ---- Dirty flag on mutations ----

describe("markDirty coverage", () => {
  it("deleteSet flags the sheet as dirty", async () => {
    const { logSet, deleteSet } = await import("@/lib/workout");
    const { isDirty, clearDirty } = await import("@/lib/sheets-sync");
    logSet({ week: 1, day: 1, exercise: W1D1_MAIN.name, setNumber: 1, actualWeight: 100, actualReps: 5 });
    clearDirty();
    expect(deleteSet(1, 1, W1D1_MAIN.name, 1)).toBe(true);
    expect(isDirty()).toBe(true);
  });

  it("setNote and deleteNote flag the sheet as dirty", async () => {
    const { setNote, deleteNote } = await import("@/lib/workout");
    const { isDirty, clearDirty } = await import("@/lib/sheets-sync");
    clearDirty();
    setNote(1, 1, W1D1_MAIN.name, "note");
    expect(isDirty()).toBe(true);
    clearDirty();
    deleteNote(1, 1, W1D1_MAIN.name);
    expect(isDirty()).toBe(true);
  });
});

// ---- Config persistence ----

describe("saveConfig / getStatus", () => {
  it("stores credentials and spreadsheet id in workout_settings", async () => {
    const { saveConfig, getStatus, isConfigured } = await import("@/lib/workout-sheets");
    const { getSetting } = await import("@/lib/workout");
    const creds = JSON.stringify({ client_email: "svc@example.iam.gserviceaccount.com", private_key: "KEY" });
    saveConfig(creds, "  SHEET_123  ");
    expect(getSetting("sheets_spreadsheet_id")).toBe("SHEET_123");
    expect(getSetting("sheets_credentials")).toBe(creds);
    expect(isConfigured()).toBe(true);
    expect(getStatus().configured).toBe(true);
  });

  it("rejects credentials JSON without client_email/private_key", async () => {
    const { saveConfig } = await import("@/lib/workout-sheets");
    expect(() => saveConfig(JSON.stringify({ foo: "bar" }), "SHEET")).toThrow();
  });
});

// ---- API route auth ----

describe("API routes", () => {
  function req(body?: unknown): Request {
    return new Request("http://localhost/api/workout/sheets/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("config/export/import return 401 when unauthenticated", async () => {
    const { auth } = await import("@/auth");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const config = await import("@/app/api/workout/sheets/config/route");
    const exp = await import("@/app/api/workout/sheets/export/route");
    const imp = await import("@/app/api/workout/sheets/import/route");

    const r1 = await config.POST(req({}) as never);
    const r2 = await exp.POST();
    const r3 = await imp.POST();
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r3.status).toBe(401);
  });

  it("config route saves config when authenticated", async () => {
    const { auth } = await import("@/auth");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { name: "test" } });
    const { getSetting } = await import("@/lib/workout");

    const config = await import("@/app/api/workout/sheets/config/route");
    const creds = JSON.stringify({ client_email: "a@b.iam.gserviceaccount.com", private_key: "K" });
    const res = await config.POST(req({ credentials: creds, spreadsheetId: "SID" }) as never);
    expect(res.status).toBe(200);
    expect(getSetting("sheets_spreadsheet_id")).toBe("SID");
  });

  it("config route rejects missing fields with 400", async () => {
    const { auth } = await import("@/auth");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { name: "test" } });
    const config = await import("@/app/api/workout/sheets/config/route");
    const res = await config.POST(req({ spreadsheetId: "SID" }) as never);
    expect(res.status).toBe(400);
  });
});
