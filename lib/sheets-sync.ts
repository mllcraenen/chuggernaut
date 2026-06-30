import { getDb } from "./workout-db";

const KEY_DIRTY = "sheets_sync_pending";

export function markDirty(): void {
  getDb()
    .prepare(
      "INSERT INTO workout_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    )
    .run(KEY_DIRTY, "1");
}

export function clearDirty(): void {
  getDb()
    .prepare(
      "INSERT INTO workout_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    )
    .run(KEY_DIRTY, "");
}

export function isDirty(): boolean {
  const row = getDb()
    .prepare("SELECT value FROM workout_settings WHERE key = ?")
    .get<{ value: string }>(KEY_DIRTY);
  return row?.value === "1";
}
