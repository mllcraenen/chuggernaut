// Invariant tests for the sync-coverage registry (roadmap 2.5).
//
// These are the scaffold that makes "forgot to sync it to the sheet"
// impossible by accident: new tables, new settings keys, and new mutators all
// fail here until they get an explicit sync decision in lib/sync-coverage.ts.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { readFileSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  TABLE_COVERAGE,
  SETTINGS_KEY_COVERAGE,
  SHEET_EXPORTED_SETTINGS,
  BLOCK_TABS,
  TAB_SESSIONS,
  TAB_SETTINGS,
} from "@/lib/sync-coverage";

const ROOT = join(__dirname, "..");

let testRoot: string;

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "sync-coverage-"));
  process.env.WORKOUT_DB_PATH = join(testRoot, "workout.db");
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
  delete process.env.WORKOUT_DB_PATH;
});

beforeEach(async () => {
  const { getDb } = await import("@/lib/workout-db");
  const db = getDb();
  for (const t of Object.keys(TABLE_COVERAGE)) db.exec(`DELETE FROM ${t}`);
});

// ---- 1. Every SCHEMA table has a sync decision ----

describe("table coverage", () => {
  it("every table in SCHEMA appears in TABLE_COVERAGE", async () => {
    const { SCHEMA } = await import("@/lib/workout-db");
    const tables = [...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(TABLE_COVERAGE[t], `table ${t} has no sync decision in lib/sync-coverage.ts`).toBeDefined();
    }
  });

  it("TABLE_COVERAGE has no stale entries (every entry exists in SCHEMA)", async () => {
    const { SCHEMA } = await import("@/lib/workout-db");
    for (const t of Object.keys(TABLE_COVERAGE)) {
      expect(SCHEMA, `registry entry ${t} not in SCHEMA`).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });
});

// ---- 2. Every settings key written in source has a sync decision ----

describe("settings key coverage", () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("every setSetting() string-literal key in lib/ and app/ is registered", () => {
    const keys = new Set<string>();
    for (const dir of ["lib", "app"]) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/setSetting\(\s*"([^"]+)"/g)) keys.add(m[1]);
      }
    }
    for (const key of keys) {
      expect(
        SETTINGS_KEY_COVERAGE[key],
        `settings key "${key}" is written in source but has no sync decision in lib/sync-coverage.ts`
      ).toBeDefined();
    }
  });

  it("key-constant definitions in the settings-owning lib files are registered", () => {
    const files = ["lib/workout.ts", "lib/workout-sheets.ts", "lib/sheets-sync.ts"];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const m of src.matchAll(/(?:SETTING_\w+|KEY_\w+|\w+_KEY)\s*=\s*"([^"]+)"/g)) {
        expect(
          SETTINGS_KEY_COVERAGE[m[1]],
          `settings key "${m[1]}" (defined in ${f}) has no sync decision`
        ).toBeDefined();
      }
    }
  });
});

// ---- 3. Every mutator of synced state marks the sheet dirty ----

describe("mutators mark the sheet dirty", () => {
  // Table-driven: each entry is (name, fn that mutates synced state).
  // Adding a mutator to lib/workout.ts? Add it here — or the export
  // completeness principle breaks silently.
  const MUTATIONS: [string, () => Promise<void>][] = [
    ["setTrainingMaxes", async () => {
      const w = await import("@/lib/workout");
      w.setTrainingMaxes([{ lift: "squat", e1rm: 180, trainingMax: 158 }]);
    }],
    ["startSession", async () => {
      const w = await import("@/lib/workout");
      w.startSession(1, 1);
    }],
    ["completeSession", async () => {
      const w = await import("@/lib/workout");
      w.completeSession(1, 2);
    }],
    ["uncompleteSession", async () => {
      const w = await import("@/lib/workout");
      w.uncompleteSession(1, 2);
    }],
    ["logSet", async () => {
      const w = await import("@/lib/workout");
      w.logSet({ week: 1, day: 1, exercise: "X", setNumber: 1, actualWeight: 100, actualReps: 5 });
    }],
    ["deleteSet", async () => {
      const w = await import("@/lib/workout");
      w.logSet({ week: 1, day: 1, exercise: "X", setNumber: 2, actualWeight: 100, actualReps: 5 });
      const { clearDirty } = await import("@/lib/sheets-sync");
      clearDirty();
      w.deleteSet(1, 1, "X", 2);
    }],
    ["createSwap", async () => {
      const w = await import("@/lib/workout");
      w.createSwap("A", "B", "day", 1, 1, null);
    }],
    ["clearSwap", async () => {
      const w = await import("@/lib/workout");
      w.clearSwap("A", 1, 1);
    }],
    ["setNote", async () => {
      const w = await import("@/lib/workout");
      w.setNote(1, 1, "X", "note");
    }],
    ["deleteNote", async () => {
      const w = await import("@/lib/workout");
      w.deleteNote(1, 1, "X");
    }],
    ["logBodyWeight", async () => {
      const w = await import("@/lib/workout");
      w.logBodyWeight("2026-07-01", 82.5);
    }],
    ["deleteBodyWeight", async () => {
      const w = await import("@/lib/workout");
      w.logBodyWeight("2026-07-02", 82.5);
      const { clearDirty } = await import("@/lib/sheets-sync");
      clearDirty();
      w.deleteBodyWeight("2026-07-02");
    }],
    ["setGoalDate", async () => {
      const w = await import("@/lib/workout");
      w.setGoalDate("2026-11-28");
    }],
    ["createExercise", async () => {
      const reg = await import("@/lib/exercise-registry");
      reg.createExercise({
        name: `Coverage Exercise ${Date.now()}`, lift: null, role: "accessory",
        loadMode: "external", repMode: "reps", e1rmMode: "epley",
      });
    }],
    ["updateExercise", async () => {
      const reg = await import("@/lib/exercise-registry");
      const ex = reg.createExercise({
        name: `Coverage Update ${Date.now()}`, lift: null, role: "accessory",
        loadMode: "external", repMode: "reps", e1rmMode: "epley",
      });
      const { clearDirty } = await import("@/lib/sheets-sync");
      clearDirty();
      reg.updateExercise(ex.id, { ...ex, e1rmMode: "none" });
    }],
    ["setExerciseArchived", async () => {
      const reg = await import("@/lib/exercise-registry");
      const ex = reg.createExercise({
        name: `Coverage Archive ${Date.now()}`, lift: null, role: "accessory",
        loadMode: "external", repMode: "reps", e1rmMode: "epley",
      });
      const { clearDirty } = await import("@/lib/sheets-sync");
      clearDirty();
      reg.setExerciseArchived(ex.id, true);
    }],
    ["recordTmEvent", async () => {
      const w = await import("@/lib/workout");
      w.recordTmEvent(
        { lift: "squat", e1rm: 180, trainingMax: 158 },
        { source: "manual" }
      );
    }],
    ["setTmAutoApply", async () => {
      const w = await import("@/lib/workout");
      w.setTmAutoApply(true);
    }],
    ["setAlternatives", async () => {
      const reg = await import("@/lib/exercise-registry");
      const ex = reg.createExercise({
        name: `Coverage Alts ${Date.now()}`, lift: null, role: "accessory",
        loadMode: "external", repMode: "reps", e1rmMode: "epley",
      });
      const { clearDirty } = await import("@/lib/sheets-sync");
      clearDirty();
      reg.setAlternatives(ex.id, []);
    }],
  ];

  for (const [name, mutate] of MUTATIONS) {
    it(`${name} marks dirty`, async () => {
      const { isDirty, clearDirty } = await import("@/lib/sheets-sync");
      clearDirty();
      await mutate();
      expect(isDirty(), `${name} did not markDirty()`).toBe(true);
    });
  }
});

// ---- 4. Export completeness: every synced entity's tab is written ----

describe("export completeness", () => {
  it("exportToSheet writes a tab for every non-exempt registry entry", async () => {
    const { exportToSheet, BLOCKS } = await import("@/lib/workout-sheets");

    const updates: string[] = [];
    const allTitles = new Set<string>();
    const sheets = {
      spreadsheets: {
        get: async () => ({ data: { sheets: [...allTitles].map((title) => ({ properties: { title, sheetId: 1 } })) } }),
        batchUpdate: async (p: { requestBody: { requests: { addSheet?: { properties: { title: string } } }[] } }) => {
          for (const r of p.requestBody.requests) {
            if (r.addSheet) allTitles.add(r.addSheet.properties.title);
          }
          return {};
        },
        values: {
          clear: async () => ({}),
          update: async (p: { range: string }) => { updates.push(p.range.split("!")[0]); return {}; },
          get: async () => ({ data: { values: [] } }),
        },
      },
    };
    await exportToSheet({ sheets: sheets as never, spreadsheetId: "SID" });

    const written = new Set(updates);
    const expectedTabs = new Set<string>();
    for (const c of [...Object.values(TABLE_COVERAGE), ...Object.values(SETTINGS_KEY_COVERAGE)]) {
      if (c.mode === "exempt") continue;
      if (c.tab === BLOCK_TABS) for (const b of BLOCKS) expectedTabs.add(b.name);
      else expectedTabs.add(c.tab);
    }
    expect(expectedTabs.size).toBeGreaterThan(0);
    for (const tab of expectedTabs) {
      expect(written.has(tab), `registry tab "${tab}" was never written by exportToSheet`).toBe(true);
    }
  });

  it("App Settings tab exports every non-exempt settings key", async () => {
    const { setGoalDate } = await import("@/lib/workout");
    setGoalDate("2026-11-28");
    const { exportToSheet } = await import("@/lib/workout-sheets");
    let settingsValues: unknown[][] = [];
    const sheets = {
      spreadsheets: {
        get: async () => ({ data: { sheets: [{ properties: { title: TAB_SETTINGS, sheetId: 1 } }] } }),
        batchUpdate: async () => ({}),
        values: {
          clear: async () => ({}),
          update: async (p: { range: string; requestBody: { values: unknown[][] } }) => {
            if (p.range.startsWith(`${TAB_SETTINGS}!`)) settingsValues = p.requestBody.values;
            return {};
          },
          get: async () => ({ data: { values: [] } }),
        },
      },
    };
    await exportToSheet({ sheets: sheets as never, spreadsheetId: "SID" });
    const exportedKeys = settingsValues.slice(1).map((r) => r[0]);
    expect(exportedKeys).toEqual(SHEET_EXPORTED_SETTINGS);
    const goalRow = settingsValues.find((r) => r[0] === "goal_date");
    expect(goalRow?.[1]).toBe("2026-11-28");
  });
});

// ---- 5. Export-only tabs are skipped on import ----

describe("export-only import skip", () => {
  it("Sessions and App Settings rows never touch the DB on import", async () => {
    const { importFromSheet } = await import("@/lib/workout-sheets");
    const { getDb } = await import("@/lib/workout-db");
    const { getGoalDate } = await import("@/lib/workout");

    const data: Record<string, unknown[][]> = {
      [TAB_SESSIONS]: [
        ["week", "day", "started_at", "completed_at"],
        [1, 1, "2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"],
      ],
      [TAB_SETTINGS]: [
        ["key", "value"],
        ["goal_date", "1999-01-01"],
      ],
    };
    const sheets = {
      spreadsheets: {
        get: async () => ({ data: { sheets: [] } }),
        batchUpdate: async () => ({}),
        values: {
          clear: async () => ({}),
          update: async () => ({}),
          get: async (p: { range: string }) => ({ data: { values: data[p.range.split("!")[0]] ?? [] } }),
        },
      },
    };
    const result = await importFromSheet({ sheets: sheets as never, spreadsheetId: "SID" });

    expect(result.rowsByTab[TAB_SESSIONS]).toBe(0);
    expect(result.rowsByTab[TAB_SETTINGS]).toBe(0);
    const sessions = getDb().prepare("SELECT COUNT(*) AS n FROM workout_sessions").get<{ n: number }>();
    expect(sessions?.n).toBe(0);
    expect(getGoalDate()).not.toBe("1999-01-01");
  });
});
