// Sync-coverage registry (roadmap 2.5).
//
// Every DB table in SCHEMA and every app-level workout_settings key must have
// an entry here: either how it reaches the Google Sheet, or an explicit
// exemption with a reason. Invariant tests (__tests__/sync-coverage.test.ts)
// derive from this registry, so adding state without deciding its sync story
// fails CI instead of silently leaving data sheet-invisible.
//
// Decisions (2026-07-06): scope = all user-entered data; direction =
// bidirectional where sheet-editing makes sense, export-only for app-managed
// values (timestamps, goal date) whose tabs the importer explicitly skips.
//
// This module must stay import-free (pure data) so anything can depend on it
// without cycles.

export type SyncCoverage =
  | { mode: "bidirectional"; tab: string }
  | { mode: "export-only"; tab: string; reason: string }
  | { mode: "exempt"; reason: string };

// Tab names for the export-only tabs (workout-sheets.ts imports these).
export const TAB_SESSIONS = "Sessions";
export const TAB_SETTINGS = "App Settings";
export const TAB_EXERCISES = "Exercises";
export const TAB_TM_HISTORY = "TM History";

// Placeholder tab name for data spread across the per-block tabs.
export const BLOCK_TABS = "<block tabs>";

export const TABLE_COVERAGE: Record<string, SyncCoverage> = {
  workout_sets: { mode: "bidirectional", tab: BLOCK_TABS },
  workout_notes: { mode: "bidirectional", tab: BLOCK_TABS }, // Notes column, first set row
  workout_training_maxes: { mode: "bidirectional", tab: "Training Maxes" },
  workout_body_weight: { mode: "bidirectional", tab: "Body Weight" },
  workout_swaps: { mode: "bidirectional", tab: "Swaps" },
  workout_sessions: {
    mode: "export-only",
    tab: TAB_SESSIONS,
    reason: "start/completion timestamps are app-managed; sheet copy is the human-readable record",
  },
  workout_settings: {
    mode: "exempt",
    reason: "key/value store — covered per key by SETTINGS_KEY_COVERAGE",
  },
  workout_exercises: {
    mode: "export-only",
    tab: TAB_EXERCISES,
    reason: "user-edited registry; edited in-app via the exercise editor, sheet copy for the record",
  },
  workout_exercise_alternatives: {
    mode: "export-only",
    tab: TAB_EXERCISES,
    reason: "rendered as the alternatives column of the Exercises tab",
  },
  workout_tm_events: {
    mode: "export-only",
    tab: TAB_TM_HISTORY,
    reason: "TM provenance audit log — app-written, sheet copy is the human-readable record",
  },
};

export const SETTINGS_KEY_COVERAGE: Record<string, SyncCoverage> = {
  goal_date: {
    mode: "export-only",
    tab: TAB_SETTINGS,
    reason: "user-entered; edited in-app, sheet copy for the record",
  },
  bar_weight: {
    mode: "export-only",
    tab: TAB_SETTINGS,
    reason: "user-entered equipment preference",
  },
  tm_factor: {
    mode: "export-only",
    tab: TAB_SETTINGS,
    reason: "user-configurable e1RM→TM factor (default 0.88)",
  },
  tm_autoregulation_log: {
    mode: "exempt",
    reason: "legacy tag log — migrated into workout_tm_events (Phase 4), kept only as migration source",
  },
  tm_auto_apply: {
    mode: "export-only",
    tab: TAB_SETTINGS,
    reason: "user preference: auto-apply TM suggestions on session completion (D2 toggle)",
  },
  sheets_credentials: { mode: "exempt", reason: "secret — must never leave the DB" },
  sheets_spreadsheet_id: { mode: "exempt", reason: "sync machinery" },
  sheets_last_sync: { mode: "exempt", reason: "sync machinery" },
  sheets_last_import: { mode: "exempt", reason: "sync machinery" },
  sheets_sync_pending: { mode: "exempt", reason: "sync machinery (dirty flag)" },
};

// Settings keys that appear in the App Settings tab, in export order.
export const SHEET_EXPORTED_SETTINGS: string[] = Object.entries(SETTINGS_KEY_COVERAGE)
  .filter(([, c]) => c.mode !== "exempt")
  .map(([k]) => k);

// A mutation of this settings key must mark the sheet dirty.
export function isSheetSyncedSettingKey(key: string): boolean {
  const c = SETTINGS_KEY_COVERAGE[key];
  return c !== undefined && c.mode !== "exempt";
}
