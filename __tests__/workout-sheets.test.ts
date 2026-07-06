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
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
});

// ---- Fake Sheets client ----

import {
  TAB_TRAINING_MAXES,
  TAB_BODY_WEIGHT,
  TAB_SWAPS,
  BLOCKS,
} from "@/lib/workout-sheets";
import { WorkoutSheetWriter } from "@/lib/sheet-writer";
import { PROGRAM } from "@/lib/workout-program";

// Program-agnostic fixture: a main-lift exercise from week 1 day 1.
const W1D1_MAIN = PROGRAM.find((d) => d.week === 1 && d.day === 1)!
  .exercises.find((e) => e.lift !== null)!;

// All tabs: program block tabs + 3 non-block tabs
const ALL_TABS = [...BLOCKS.map(b => b.name), TAB_TRAINING_MAXES, TAB_BODY_WEIGHT, TAB_SWAPS];

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
