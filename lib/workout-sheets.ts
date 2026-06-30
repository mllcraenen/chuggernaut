import { getDb } from "./workout-db";
import { getSetting, setSetting, getTrainingMaxes } from "./workout";
import { PROGRAM } from "./workout-program";
import { isDirty, clearDirty, markDirty } from "./sheets-sync";

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

export const TAB_PROGRAM = "Program";
export const TAB_TRAINING_MAXES = "Training Maxes";
export const TAB_SESSIONS = "Sessions";
export const TAB_SETS = "Sets";
export const TAB_BODY_WEIGHT = "Body Weight";
export const TAB_SWAPS = "Swaps";

// Header row for every tab. Export order follows this object's key order.
export const TAB_HEADERS: Record<string, string[]> = {
  [TAB_PROGRAM]: [
    "week", "day", "day_label", "exercise", "set_number",
    "lift", "prescribed_pct", "prescribed_weight_kg", "prescribed_reps", "prescribed_rpe", "note",
  ],
  [TAB_TRAINING_MAXES]: ["lift", "e1rm", "training_max", "set_at"],
  [TAB_SESSIONS]: ["week", "day", "started_at", "completed_at"],
  [TAB_SETS]: [
    "week",
    "day",
    "exercise",
    "set_number",
    "prescribed_weight",
    "prescribed_reps",
    "prescribed_rpe",
    "actual_weight",
    "actual_reps",
    "actual_rpe",
    "e1rm",
    "logged_at",
  ],
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
};

// Program tab is first so it's the landing view in the sheet.
const TAB_ORDER = [
  TAB_PROGRAM,
  TAB_TRAINING_MAXES,
  TAB_SESSIONS,
  TAB_SETS,
  TAB_BODY_WEIGHT,
  TAB_SWAPS,
];

// Minimal structural type of the googleapis Sheets v4 client we rely on.
// Both the real google.sheets() client and the test fakes satisfy this.
export interface SheetsApi {
  spreadsheets: {
    get(params: { spreadsheetId: string }): Promise<{
      data: { sheets?: { properties?: { title?: string } }[] };
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

function readTabRows(tab: string): (string | number)[][] {
  const db = getDb();
  switch (tab) {
    case TAB_PROGRAM: {
      const tms = getTrainingMaxes();
      const rows: (string | number)[][] = [];
      for (const programDay of PROGRAM) {
        for (const exercise of programDay.exercises) {
          for (const set of exercise.sets) {
            const pct = set.percentOfTM;
            let weight: number | "" = "";
            if (pct !== null && exercise.lift && tms[exercise.lift]) {
              weight = Math.round(tms[exercise.lift].trainingMax * pct / 100 * 2) / 2;
            }
            rows.push([
              cell(programDay.week),
              cell(programDay.day),
              cell(programDay.label),
              cell(exercise.name),
              cell(set.setNumber),
              cell(exercise.lift ?? ""),
              cell(pct ?? ""),
              cell(weight),
              cell(set.reps),
              cell(set.rpe ?? ""),
              cell(set.note ?? ""),
            ]);
          }
        }
      }
      return rows;
    }
    case TAB_TRAINING_MAXES: {
      const rows = db
        .prepare("SELECT lift, e1rm, training_max, set_at FROM workout_training_maxes ORDER BY id ASC")
        .all<{ lift: string; e1rm: number; training_max: number; set_at: string }>();
      return rows.map((r) => [cell(r.lift), cell(r.e1rm), cell(r.training_max), cell(r.set_at)]);
    }
    case TAB_SESSIONS: {
      const rows = db
        .prepare("SELECT week, day, started_at, completed_at FROM workout_sessions ORDER BY week ASC, day ASC")
        .all<{ week: number; day: number; started_at: string | null; completed_at: string | null }>();
      return rows.map((r) => [cell(r.week), cell(r.day), cell(r.started_at), cell(r.completed_at)]);
    }
    case TAB_SETS: {
      const rows = db
        .prepare(
          `SELECT week, day, exercise, set_number, prescribed_weight, prescribed_reps,
                  prescribed_rpe, actual_weight, actual_reps, actual_rpe, e1rm, logged_at
             FROM workout_sets ORDER BY week ASC, day ASC, exercise ASC, set_number ASC`
        )
        .all<Record<string, unknown>>();
      return rows.map((r) => [
        cell(r.week), cell(r.day), cell(r.exercise), cell(r.set_number),
        cell(r.prescribed_weight), cell(r.prescribed_reps), cell(r.prescribed_rpe),
        cell(r.actual_weight), cell(r.actual_reps), cell(r.actual_rpe),
        cell(r.e1rm), cell(r.logged_at),
      ]);
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

function upsertTabRows(tab: string, rows: unknown[][]): number {
  const db = getDb();
  let count = 0;
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
    case TAB_SESSIONS: {
      const stmt = db.prepare(
        `INSERT INTO workout_sessions (week, day, started_at, completed_at) VALUES (?,?,?,?)
         ON CONFLICT(week, day) DO UPDATE SET started_at=excluded.started_at, completed_at=excluded.completed_at`
      );
      for (const row of rows) {
        const week = numOrNull(row[0]);
        const day = numOrNull(row[1]);
        if (week === null || day === null) continue;
        stmt.run(week, day, str(row[2]) || null, str(row[3]) || null);
        count++;
      }
      return count;
    }
    case TAB_SETS: {
      const exists = db.prepare(
        "SELECT id FROM workout_sets WHERE week = ? AND day = ? AND exercise = ? AND set_number = ?"
      );
      const upd = db.prepare(
        `UPDATE workout_sets SET prescribed_weight=?, prescribed_reps=?, prescribed_rpe=?,
           actual_weight=?, actual_reps=?, actual_rpe=?, e1rm=?, logged_at=?
         WHERE week=? AND day=? AND exercise=? AND set_number=?`
      );
      const ins = db.prepare(
        `INSERT INTO workout_sets
           (week, day, exercise, set_number, prescribed_weight, prescribed_reps, prescribed_rpe,
            actual_weight, actual_reps, actual_rpe, e1rm, logged_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      );
      for (const row of rows) {
        const week = numOrNull(row[0]);
        const day = numOrNull(row[1]);
        const exercise = str(row[2]);
        const setNumber = numOrNull(row[3]);
        if (week === null || day === null || !exercise || setNumber === null) continue;
        const vals = [
          numOrNull(row[4]), numOrNull(row[5]), numOrNull(row[6]),
          numOrNull(row[7]), numOrNull(row[8]), numOrNull(row[9]),
          numOrNull(row[10]), str(row[11]) || null,
        ];
        if (exists.get<{ id: number }>(week, day, exercise, setNumber)) {
          upd.run(...vals, week, day, exercise, setNumber);
        } else {
          ins.run(week, day, exercise, setNumber, ...vals);
        }
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
    default:
      return 0;
  }
}

// ----- Tab management -----

// Ensure every required tab exists; create missing ones via batchUpdate.
async function ensureTabs(ctx: SheetsContext): Promise<void> {
  const meta = await ctx.sheets.spreadsheets.get({ spreadsheetId: ctx.spreadsheetId });
  const existing = new Set(
    (meta.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t))
  );
  const requests = TAB_ORDER.filter((t) => !existing.has(t)).map((title) => ({
    addSheet: { properties: { title } },
  }));
  if (requests.length > 0) {
    await ctx.sheets.spreadsheets.batchUpdate({
      spreadsheetId: ctx.spreadsheetId,
      requestBody: { requests },
    });
  }
}

// ----- Export / Import -----

export interface ExportResult {
  ok: true;
  rowsByTab: Record<string, number>;
  lastSync: string;
}

// DB -> Sheet. For each tab: clear data, then write header + all rows.
export async function exportToSheet(ctx?: SheetsContext): Promise<ExportResult> {
  const context = ctx ?? (await getSheetsContext());
  await ensureTabs(context);

  const rowsByTab: Record<string, number> = {};
  for (const tab of TAB_ORDER) {
    const header = TAB_HEADERS[tab];
    const rows = readTabRows(tab);
    // Clear existing data (including stale rows beyond the new data set).
    await context.sheets.spreadsheets.values.clear({
      spreadsheetId: context.spreadsheetId,
      range: `${tab}!A:Z`,
    });
    await context.sheets.spreadsheets.values.update({
      spreadsheetId: context.spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header, ...rows] },
    });
    rowsByTab[tab] = rows.length;
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
// Program tab is skipped on import (it's export-only / derived from DB).
export async function importFromSheet(ctx?: SheetsContext): Promise<ImportResult> {
  const context = ctx ?? (await getSheetsContext());

  const rowsByTab: Record<string, number> = {};
  for (const tab of TAB_ORDER) {
    if (tab === TAB_PROGRAM) continue; // export-only
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
    const dataRows = values.slice(1); // skip header
    rowsByTab[tab] = upsertTabRows(tab, dataRows);
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
