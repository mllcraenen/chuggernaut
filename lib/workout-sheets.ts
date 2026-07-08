import { getDb } from "./workout-db";
import { getSetting, setSetting, getTrainingMaxes, computeSetE1rm, validateSetWeight } from "./workout";
import { PROGRAM, PROGRAM_BLOCKS } from "./workout-program";
import { isDirty, clearDirty, markDirty } from "./sheets-sync";
import { WorkoutSheetWriter, type BlockDefinition } from "./sheet-writer";
import { TAB_SESSIONS, TAB_SETTINGS, TAB_EXERCISES, SHEET_EXPORTED_SETTINGS } from "./sync-coverage";
import { listExercises, getAlternativesFor } from "./exercise-registry";

export { TAB_SESSIONS, TAB_SETTINGS, TAB_EXERCISES };

export type { BlockDefinition };

// Block tab definitions are derived from the active program's layout
// (lib/workout-program.ts) rather than hardcoded per program.
export const BLOCKS: BlockDefinition[] = PROGRAM_BLOCKS;

// ---------------------------------------------------------------------------
// Google Sheets bidirectional sync for the workout tool.
//
// Credentials (a Google service-account JSON) and the target spreadsheet id
// live in the workout_settings table. The service-account email must have
// Editor access to the sheet (granted by the user in the Google Drive UI).
//
// The Sheets client is injectable (see SheetsApi) so the export/import logic
// can be unit-tested with a fake client and no network access.
// ---------------------------------------------------------------------------

export const SETTING_CREDENTIALS = "sheets_credentials";
export const SETTING_SPREADSHEET_ID = "sheets_spreadsheet_id";
export const SETTING_LAST_SYNC = "sheets_last_sync";
export const SETTING_LAST_IMPORT = "sheets_last_import";

export const TAB_TRAINING_MAXES = "Training Maxes";
export const TAB_BODY_WEIGHT = "Body Weight";
export const TAB_SWAPS = "Swaps";

// Header row for non-block tabs.
export const TAB_HEADERS: Record<string, string[]> = {
  [TAB_TRAINING_MAXES]: ["lift", "e1rm", "training_max", "set_at"],
  [TAB_BODY_WEIGHT]: ["date", "weight_kg"],
  [TAB_SWAPS]: [
    "original_exercise",
    "replacement_exercise",
    "scope",
    "week",
    "day",
    "block_end_week",
    "created_at",
  ],
  [TAB_SESSIONS]: ["week", "day", "started_at", "completed_at"],
  [TAB_SETTINGS]: ["key", "value"],
  [TAB_EXERCISES]: ["name", "lift", "role", "load_mode", "rep_mode", "e1rm_mode", "archived", "alternatives"],
};

// Block tabs come first so they are the landing view. Non-block tabs follow:
// TMs / body weight / swaps sync bidirectionally; Sessions and App Settings
// are export-only (see lib/sync-coverage.ts) and skipped on import.
const TAB_ORDER = [
  ...BLOCKS.map(b => b.name),
  TAB_TRAINING_MAXES,
  TAB_BODY_WEIGHT,
  TAB_SWAPS,
  TAB_SESSIONS,
  TAB_SETTINGS,
  TAB_EXERCISES,
];

// Block tab names for test assertions and allow-list checks.
export const BLOCK_TAB_NAMES = new Set(BLOCKS.map(b => b.name));

// Minimal structural type of the googleapis Sheets v4 client we rely on.
// Both the real google.sheets() client and the test fakes satisfy this.
export interface SheetsApi {
  spreadsheets: {
    get(params: { spreadsheetId: string }): Promise<{
      data: { sheets?: { properties?: { title?: string; sheetId?: number } }[] };
    }>;
    batchUpdate(params: {
      spreadsheetId: string;
      requestBody: { requests: unknown[] };
    }): Promise<unknown>;
    values: {
      get(params: { spreadsheetId: string; range: string }): Promise<{
        data: { values?: unknown[][] };
      }>;
      update(params: {
        spreadsheetId: string;
        range: string;
        valueInputOption: string;
        requestBody: { values: unknown[][] };
      }): Promise<unknown>;
      clear(params: { spreadsheetId: string; range: string }): Promise<unknown>;
    };
  };
}

export interface SheetsContext {
  sheets: SheetsApi;
  spreadsheetId: string;
}

// ----- Configuration -----

export function isConfigured(): boolean {
  return Boolean(getSetting(SETTING_CREDENTIALS)) && Boolean(getSetting(SETTING_SPREADSHEET_ID));
}

export interface SyncStatus {
  configured: boolean;
  lastSync: string | null;
  lastImport: string | null;
}

export function getStatus(): SyncStatus {
  return {
    configured: isConfigured(),
    lastSync: getSetting(SETTING_LAST_SYNC),
    lastImport: getSetting(SETTING_LAST_IMPORT),
  };
}

// Persist credentials + spreadsheet id. Credentials JSON is validated as
// parseable but never logged or returned to the client.
export function saveConfig(credentialsJson: string, spreadsheetId: string): void {
  const parsed = JSON.parse(credentialsJson);
  if (!parsed || typeof parsed !== "object" || !parsed.client_email || !parsed.private_key) {
    throw new Error("credentials JSON missing client_email/private_key");
  }
  setSetting(SETTING_CREDENTIALS, credentialsJson);
  setSetting(SETTING_SPREADSHEET_ID, spreadsheetId.trim());
}

// Build a real googleapis Sheets client from stored credentials. Imported
// lazily so the (heavy) googleapis dep is only loaded when actually syncing.
export async function getSheetsContext(): Promise<SheetsContext> {
  const credsRaw = getSetting(SETTING_CREDENTIALS);
  const spreadsheetId = getSetting(SETTING_SPREADSHEET_ID);
  if (!credsRaw || !spreadsheetId) throw new Error("Sheets sync is not configured");

  const creds = JSON.parse(credsRaw);
  const { google } = await import("googleapis");
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth: jwt }) as unknown as SheetsApi;
  return { sheets, spreadsheetId };
}

// ----- DB row readers (DB -> Sheet) -----

function cell(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v);
}

function makeWriter(): WorkoutSheetWriter {
  const tms = getTrainingMaxes();
  const db = getDb();
  const loggedSets = db
    .prepare("SELECT * FROM workout_sets WHERE logged_at IS NOT NULL")
    .all<Record<string, unknown>>()
    .map(r => ({
      id: r.id as number,
      week: r.week as number,
      day: r.day as number,
      exercise: r.exercise as string,
      setNumber: r.set_number as number,
      prescribedWeight: r.prescribed_weight as number | null,
      prescribedReps: r.prescribed_reps as number | null,
      prescribedRpe: r.prescribed_rpe as number | null,
      actualWeight: r.actual_weight as number | null,
      actualReps: r.actual_reps as number | null,
      actualRpe: r.actual_rpe as number | null,
      e1rm: r.e1rm as number | null,
      loggedAt: r.logged_at as string | null,
    }));
  const notes: Record<string, string> = {};
  for (const n of db
    .prepare("SELECT week, day, exercise, note FROM workout_notes")
    .all<{ week: number; day: number; exercise: string; note: string }>()) {
    notes[WorkoutSheetWriter.noteKey(n.week, n.day, n.exercise)] = n.note;
  }
  const timeExercises = new Set(
    listExercises({ includeArchived: true })
      .filter((e) => e.repMode === "time")
      .map((e) => e.name)
  );
  return new WorkoutSheetWriter(PROGRAM, BLOCKS, tms, loggedSets, notes, timeExercises);
}

function readTabRows(tab: string): (string | number)[][] {
  const db = getDb();

  // Block tabs — generated by WorkoutSheetWriter
  if (BLOCK_TAB_NAMES.has(tab)) {
    const block = BLOCKS.find(b => b.name === tab);
    if (!block) return [];
    return makeWriter().generateBlock(block) as (string | number)[][];
  }

  switch (tab) {
    case TAB_TRAINING_MAXES: {
      const rows = db
        .prepare("SELECT lift, e1rm, training_max, set_at FROM workout_training_maxes ORDER BY id ASC")
        .all<{ lift: string; e1rm: number; training_max: number; set_at: string }>();
      return rows.map((r) => [cell(r.lift), cell(r.e1rm), cell(r.training_max), cell(r.set_at)]);
    }
    case TAB_BODY_WEIGHT: {
      const rows = db
        .prepare("SELECT date, weight_kg FROM workout_body_weight ORDER BY date ASC")
        .all<{ date: string; weight_kg: number }>();
      return rows.map((r) => [cell(r.date), cell(r.weight_kg)]);
    }
    case TAB_SWAPS: {
      const rows = db
        .prepare(
          `SELECT original_exercise, replacement_exercise, scope, week, day, block_end_week, created_at
             FROM workout_swaps ORDER BY id ASC`
        )
        .all<Record<string, unknown>>();
      return rows.map((r) => [
        cell(r.original_exercise), cell(r.replacement_exercise), cell(r.scope),
        cell(r.week), cell(r.day), cell(r.block_end_week), cell(r.created_at),
      ]);
    }
    case TAB_SESSIONS: {
      const rows = db
        .prepare("SELECT week, day, started_at, completed_at FROM workout_sessions ORDER BY week ASC, day ASC")
        .all<{ week: number; day: number; started_at: string | null; completed_at: string | null }>();
      return rows.map((r) => [cell(r.week), cell(r.day), cell(r.started_at), cell(r.completed_at)]);
    }
    case TAB_SETTINGS: {
      return SHEET_EXPORTED_SETTINGS.map((key) => {
        const row = db
          .prepare("SELECT value FROM workout_settings WHERE key = ?")
          .get<{ value: string }>(key);
        return [key, cell(row?.value ?? "")];
      });
    }
    case TAB_EXERCISES: {
      return listExercises({ includeArchived: true }).map((e) => [
        e.name,
        cell(e.lift),
        e.role,
        e.loadMode,
        e.repMode,
        e.e1rmMode,
        e.archived ? 1 : 0,
        getAlternativesFor(e.name).join(", "),
      ]);
    }
    default:
      return [];
  }
}

// ----- Sheet upserts (Sheet -> DB) -----

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}
function numOrNull(v: unknown): number | null {
  const s = str(v);
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function upsertTabRows(tab: string, rows: unknown[][], hasNotesColumn = false): number {
  const db = getDb();
  let count = 0;

  // Block tabs — parse key column, upsert actual values only
  if (BLOCK_TAB_NAMES.has(tab)) {
    // Notes (only when the tab's header has the column — older sheets leave
    // DB notes untouched). Sheet is authoritative: empty cell clears the note.
    // Raw SQL, not setNote/deleteNote — importing must not re-mark dirty.
    if (hasNotesColumn) {
      const insNote = db.prepare(
        `INSERT INTO workout_notes (week, day, exercise, note, updated_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(week, day, exercise) DO UPDATE SET note=excluded.note, updated_at=excluded.updated_at`
      );
      const delNote = db.prepare(
        "DELETE FROM workout_notes WHERE week=? AND day=? AND exercise=?"
      );
      const now = new Date().toISOString();
      for (const n of WorkoutSheetWriter.parseBlockNotes(rows)) {
        if (n.note) insNote.run(n.week, n.day, n.exercise, n.note, now);
        else delNote.run(n.week, n.day, n.exercise);
      }
    }

    const records = WorkoutSheetWriter.parseBlockRows(rows);
    const exists = db.prepare(
      "SELECT id FROM workout_sets WHERE week=? AND day=? AND exercise=? AND set_number=?"
    );
    const upd = db.prepare(
      `UPDATE workout_sets SET actual_weight=?, actual_reps=?, actual_rpe=?, e1rm=?, logged_at=COALESCE(logged_at,?)
       WHERE week=? AND day=? AND exercise=? AND set_number=?`
    );
    const ins = db.prepare(
      `INSERT INTO workout_sets (week, day, exercise, set_number, actual_weight, actual_reps, actual_rpe, e1rm, logged_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const now = new Date().toISOString();
    for (const r of records) {
      // Server-side guard (2.4/3.4): a sheet edit is client input like any
      // other — load-mode-aware, so assisted exercises may carry negative
      // weight while everything else stays ≥ 0.
      if (r.actualWeight != null && validateSetWeight(r.exercise, r.actualWeight) !== null) continue;
      if (r.actualReps != null && r.actualReps < 1) continue;
      const e1rm = (r.actualWeight != null && r.actualReps != null)
        ? computeSetE1rm(r.exercise, r.actualWeight, r.actualReps)
        : null;
      const found = exists.get<{ id: number }>(r.week, r.day, r.exercise, r.setNumber);
      if (found) {
        upd.run(r.actualWeight, r.actualReps, r.actualRpe, e1rm, now, r.week, r.day, r.exercise, r.setNumber);
      } else {
        ins.run(r.week, r.day, r.exercise, r.setNumber, r.actualWeight, r.actualReps, r.actualRpe, e1rm, now);
      }
      count++;
    }
    return count;
  }

  switch (tab) {
    case TAB_TRAINING_MAXES: {
      // training_maxes has no natural unique constraint in the base schema, so
      // dedupe manually on (lift, set_at) to make import idempotent.
      const exists = db.prepare(
        "SELECT id FROM workout_training_maxes WHERE lift = ? AND set_at = ?"
      );
      const upd = db.prepare(
        "UPDATE workout_training_maxes SET e1rm = ?, training_max = ? WHERE lift = ? AND set_at = ?"
      );
      const ins = db.prepare(
        "INSERT INTO workout_training_maxes (lift, e1rm, training_max, set_at) VALUES (?,?,?,?)"
      );
      for (const row of rows) {
        const lift = str(row[0]);
        const setAt = str(row[3]);
        if (!lift || !setAt) continue;
        const e1rm = numOrNull(row[1]) ?? 0;
        const tm = numOrNull(row[2]) ?? 0;
        const found = exists.get<{ id: number }>(lift, setAt);
        if (found) upd.run(e1rm, tm, lift, setAt);
        else ins.run(lift, e1rm, tm, setAt);
        count++;
      }
      return count;
    }
    case TAB_BODY_WEIGHT: {
      const stmt = db.prepare(
        `INSERT INTO workout_body_weight (date, weight_kg) VALUES (?,?)
         ON CONFLICT(date) DO UPDATE SET weight_kg=excluded.weight_kg`
      );
      for (const row of rows) {
        const date = str(row[0]);
        const weight = numOrNull(row[1]);
        if (!date || weight === null) continue;
        stmt.run(date, weight);
        count++;
      }
      return count;
    }
    case TAB_SWAPS: {
      const exists = db.prepare(
        "SELECT id FROM workout_swaps WHERE original_exercise = ? AND scope = ? AND IFNULL(week,-1) = ? AND IFNULL(day,-1) = ?"
      );
      const upd = db.prepare(
        "UPDATE workout_swaps SET replacement_exercise=?, block_end_week=?, created_at=? WHERE id=?"
      );
      const ins = db.prepare(
        `INSERT INTO workout_swaps
           (original_exercise, replacement_exercise, scope, week, day, block_end_week, created_at)
         VALUES (?,?,?,?,?,?,?)`
      );
      for (const row of rows) {
        const orig = str(row[0]);
        const scope = str(row[2]);
        if (!orig || (scope !== "day" && scope !== "block")) continue;
        const week = numOrNull(row[3]);
        const day = numOrNull(row[4]);
        const blockEnd = numOrNull(row[5]);
        const createdAt = str(row[6]) || new Date().toISOString();
        const repl = str(row[1]);
        const found = exists.get<{ id: number }>(orig, scope, week ?? -1, day ?? -1);
        if (found) upd.run(repl, blockEnd, createdAt, found.id);
        else ins.run(orig, repl, scope, week, day, blockEnd, createdAt);
        count++;
      }
      return count;
    }
    // Export-only tabs (lib/sync-coverage.ts): the sheet copy is a
    // human-readable record; the DB stays authoritative. Explicitly skipped.
    case TAB_SESSIONS:
    case TAB_SETTINGS:
    case TAB_EXERCISES:
      return 0;
    default:
      return 0;
  }
}

// ----- Formatting -----

type Color = { red: number; green: number; blue: number };
const rgb = (r: number, g: number, b: number): Color => ({ red: r / 255, green: g / 255, blue: b / 255 });

// Calgary Barbell palette
const C = {
  HEADER_BG:  rgb(30,  60,  114),  // deep navy
  DAY_BG:     rgb(45,  85,  155),  // medium blue
  WEEK_BG:    rgb(197, 210, 235),  // pale blue
  WHITE:      rgb(255, 255, 255),
  DARK:       rgb(33,  33,  33),
  KEY_GRAY:   rgb(200, 200, 200),  // near-invisible key column text
  ACTUAL_BG:  rgb(255, 253, 220),  // light yellow — "fill me in"
  HEADER_SM:  rgb(60,  90,  150),  // non-block tab header
};

function cellFmt(bg: Color, fg: Color, bold = false, fontSize = 10) {
  return {
    userEnteredFormat: {
      backgroundColor: bg,
      textFormat: { bold, foregroundColor: fg, fontSize },
    },
  };
}

async function applyBlockFormatting(
  ctx: SheetsContext,
  sheetId: number,
  rows: (string | number)[][],  // raw rows from generateBlock (header NOT prepended)
): Promise<void> {
  const requests: unknown[] = [];
  const totalRows = rows.length + 1; // +1 for header row

  // Header row (index 0): bold navy
  requests.push({ repeatCell: {
    range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
    cell: cellFmt(C.HEADER_BG, C.WHITE, true, 10),
    fields: "userEnteredFormat(backgroundColor,textFormat)",
  }});

  // Iterate data rows (offset by 1 for the header)
  for (let i = 0; i < rows.length; i++) {
    const ri = i + 1;
    const row = rows[i];
    const key = String(row[0] ?? "");
    const col3 = String(row[3] ?? "");
    const col5 = String(row[5] ?? "");

    if (key === "" && col3.startsWith("=== Day")) {
      requests.push({ repeatCell: {
        range: { sheetId, startRowIndex: ri, endRowIndex: ri + 1 },
        cell: cellFmt(C.DAY_BG, C.WHITE, true, 10),
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      }});
    } else if (key === "" && col5.startsWith("— Week")) {
      requests.push({ repeatCell: {
        range: { sheetId, startRowIndex: ri, endRowIndex: ri + 1 },
        cell: cellFmt(C.WEEK_BG, C.DARK, true, 9),
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      }});
    }
  }

  // Key column (A): tiny gray text throughout data rows
  requests.push({ repeatCell: {
    range: { sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: 1 },
    cell: { userEnteredFormat: { textFormat: { foregroundColor: C.KEY_GRAY, fontSize: 7 } } },
    fields: "userEnteredFormat(textFormat)",
  }});

  // Actual columns H, I, J (indices 7, 8, 9): light yellow
  requests.push({ repeatCell: {
    range: { sheetId, startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: 7, endColumnIndex: 10 },
    cell: { userEnteredFormat: { backgroundColor: C.ACTUAL_BG } },
    fields: "userEnteredFormat(backgroundColor)",
  }});

  // Column widths (pixels)
  const colWidths: [number, number, number][] = [
    [0, 1, 65],   // _key
    [1, 2, 50],   // Week
    [2, 3, 40],   // Day
    [3, 4, 110],  // Session
    [4, 5, 210],  // Exercise
    [5, 6, 140],  // Set
    [6, 7, 155],  // Prescribed
    [7, 8, 120],  // Actual Weight
    [8, 9, 95],   // Actual Reps
    [9, 10, 65],  // RPE
    [10, 11, 80], // e1RM
    [11, 12, 200], // Notes
  ];
  for (const [start, end, px] of colWidths) {
    requests.push({ updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: start, endIndex: end },
      properties: { pixelSize: px },
      fields: "pixelSize",
    }});
  }

  // Freeze header row
  requests.push({ updateSheetProperties: {
    properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
    fields: "gridProperties.frozenRowCount",
  }});

  await ctx.sheets.spreadsheets.batchUpdate({
    spreadsheetId: ctx.spreadsheetId,
    requestBody: { requests },
  });
}

async function applySimpleHeaderFormat(ctx: SheetsContext, sheetId: number): Promise<void> {
  await ctx.sheets.spreadsheets.batchUpdate({
    spreadsheetId: ctx.spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: cellFmt(C.HEADER_SM, C.WHITE, true, 10),
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      }],
    },
  });
}

// ----- Tab management -----

// Ensure the sheet has exactly the tabs in TAB_ORDER, in that order.
// Deletes stale tabs, adds missing ones, then reorders to match TAB_ORDER.
// Returns a map of tab name → numeric sheetId (needed for formatting).
async function ensureTabs(ctx: SheetsContext): Promise<Map<string, number>> {
  const meta = await ctx.sheets.spreadsheets.get({ spreadsheetId: ctx.spreadsheetId });
  const sheetMeta = meta.data.sheets ?? [];
  const tabOrderSet = new Set(TAB_ORDER);

  // 1. Delete stale tabs (exist in sheet but NOT in our TAB_ORDER)
  const staleSheets = sheetMeta.filter(s => {
    const title = s.properties?.title;
    return title && !tabOrderSet.has(title);
  });
  if (staleSheets.length > 0) {
    await ctx.sheets.spreadsheets.batchUpdate({
      spreadsheetId: ctx.spreadsheetId,
      requestBody: {
        requests: staleSheets
          .filter(s => s.properties?.sheetId != null)
          .map(s => ({ deleteSheet: { sheetId: s.properties!.sheetId! } })),
      },
    });
  }

  // 2. Add missing tabs
  const existingTitles = new Set(sheetMeta.map(s => s.properties?.title).filter(Boolean));
  const missing = TAB_ORDER.filter(t => !existingTitles.has(t));
  if (missing.length > 0) {
    await ctx.sheets.spreadsheets.batchUpdate({
      spreadsheetId: ctx.spreadsheetId,
      requestBody: {
        requests: missing.map(title => ({ addSheet: { properties: { title } } })),
      },
    });
  }

  // 3. Re-fetch to get fresh sheetIds, then reorder to match TAB_ORDER
  const fresh = await ctx.sheets.spreadsheets.get({ spreadsheetId: ctx.spreadsheetId });
  const idMap = new Map<string, number>();
  for (const s of fresh.data.sheets ?? []) {
    const title = s.properties?.title;
    const id = s.properties?.sheetId;
    if (title && id != null) idMap.set(title, id);
  }

  // Reorder tabs to match TAB_ORDER exactly
  const reorderRequests = TAB_ORDER
    .map((tabName, index) => {
      const sheetId = idMap.get(tabName);
      if (sheetId == null) return null;
      return {
        updateSheetProperties: {
          properties: { sheetId, index },
          fields: "index",
        },
      };
    })
    .filter(Boolean);
  if (reorderRequests.length > 0) {
    await ctx.sheets.spreadsheets.batchUpdate({
      spreadsheetId: ctx.spreadsheetId,
      requestBody: { requests: reorderRequests },
    });
  }

  return idMap;
}

// ----- Export / Import -----

export interface ExportResult {
  ok: true;
  rowsByTab: Record<string, number>;
  lastSync: string;
}

// DB -> Sheet. For each tab: clear data, write values, then apply formatting.
export async function exportToSheet(ctx?: SheetsContext): Promise<ExportResult> {
  const context = ctx ?? (await getSheetsContext());
  const sheetIds = await ensureTabs(context);

  const rowsByTab: Record<string, number> = {};
  for (const tab of TAB_ORDER) {
    const rows = readTabRows(tab);
    await context.sheets.spreadsheets.values.clear({
      spreadsheetId: context.spreadsheetId,
      range: `${tab}!A:Z`,
    });
    const allRows = BLOCK_TAB_NAMES.has(tab)
      ? [WorkoutSheetWriter.HEADER, ...rows]
      : [TAB_HEADERS[tab], ...rows];
    await context.sheets.spreadsheets.values.update({
      spreadsheetId: context.spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: allRows },
    });
    rowsByTab[tab] = rows.length;

    // Apply formatting if we have the sheetId
    const sheetId = sheetIds.get(tab);
    if (sheetId != null) {
      if (BLOCK_TAB_NAMES.has(tab)) {
        await applyBlockFormatting(context, sheetId, rows as (string | number)[][]);
      } else {
        await applySimpleHeaderFormat(context, sheetId);
      }
    }
  }

  const lastSync = new Date().toISOString();
  setSetting(SETTING_LAST_SYNC, lastSync);
  return { ok: true, rowsByTab, lastSync };
}

export interface ImportResult {
  ok: true;
  rowsByTab: Record<string, number>;
  lastSync: string;
}

// Sheet -> DB. Read each tab, skip header, upsert into the matching table.
export async function importFromSheet(ctx?: SheetsContext): Promise<ImportResult> {
  const context = ctx ?? (await getSheetsContext());

  const rowsByTab: Record<string, number> = {};
  for (const tab of TAB_ORDER) {
    let values: unknown[][] = [];
    try {
      const res = await context.sheets.spreadsheets.values.get({
        spreadsheetId: context.spreadsheetId,
        range: `${tab}!A:Z`,
      });
      values = res.data.values ?? [];
    } catch {
      // Tab may not exist yet on a fresh sheet — treat as empty.
      values = [];
    }
    const header = values[0] ?? [];
    const hasNotesColumn = header.some((c) => String(c ?? "").trim() === "Notes");
    const dataRows = values.slice(1); // skip header
    rowsByTab[tab] = upsertTabRows(tab, dataRows, hasNotesColumn);
  }

  const lastSync = new Date().toISOString();
  setSetting(SETTING_LAST_SYNC, lastSync);
  return { ok: true, rowsByTab, lastSync };
}

// ----- Auto-sync helpers -----

// Fire-and-forget export after any write. Debounced to at most once per 60s.
// Safe to call synchronously from route handlers — never awaited.
export function triggerExportIfDue(): void {
  if (!isConfigured()) return;
  if (!isDirty()) return;
  const lastSync = getSetting(SETTING_LAST_SYNC);
  if (lastSync) {
    const age = Date.now() - new Date(lastSync).getTime();
    if (age < 60_000) return; // debounce
  }
  clearDirty();
  exportToSheet().catch(() => markDirty()); // restore dirty flag on failure
}

// Called from page server components. Imports from sheet if > 15 min stale.
// Never throws — sheet errors must not break page renders.
export async function importIfStale(): Promise<void> {
  if (!isConfigured()) return;
  const lastImport = getSetting(SETTING_LAST_IMPORT);
  if (lastImport) {
    const age = Date.now() - new Date(lastImport).getTime();
    if (age < 15 * 60 * 1000) return;
  }
  try {
    await importFromSheet();
    setSetting(SETTING_LAST_IMPORT, new Date().toISOString());
  } catch {
    // silent — sheet errors must not block page render
  }
}
