import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

// SQLite store for the workout tool. Uses the built-in node:sqlite driver
// (no native deps). Path is overridable via WORKOUT_DB_PATH for tests and is
// read lazily (on first getDb) so tests can set it after importing this module.
function dbPath(): string {
  return process.env.WORKOUT_DB_PATH ?? "/home/admin/data/workout.db";
}

// Exported so the sync-coverage invariant test can parse table names out of
// it — every table must have an entry in lib/sync-coverage.ts.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS workout_training_maxes (
  id INTEGER PRIMARY KEY,
  lift TEXT NOT NULL,
  e1rm REAL NOT NULL,
  training_max REAL NOT NULL,
  set_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY,
  week INTEGER NOT NULL,
  day INTEGER NOT NULL,
  completed_at TEXT,
  started_at TEXT
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY,
  week INTEGER NOT NULL,
  day INTEGER NOT NULL,
  exercise TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  prescribed_weight REAL,
  prescribed_reps INTEGER,
  prescribed_rpe REAL,
  actual_weight REAL,
  actual_reps INTEGER,
  actual_rpe REAL,
  e1rm REAL,
  logged_at TEXT
);

CREATE TABLE IF NOT EXISTS workout_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_swaps (
  id INTEGER PRIMARY KEY,
  original_exercise TEXT NOT NULL,
  replacement_exercise TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('day','block')),
  week INTEGER,
  day INTEGER,
  block_end_week INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_body_weight (
  id INTEGER PRIMARY KEY,
  date TEXT UNIQUE NOT NULL,
  weight_kg REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_notes (
  id INTEGER PRIMARY KEY,
  week INTEGER NOT NULL,
  day INTEGER NOT NULL,
  exercise TEXT NOT NULL,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(week, day, exercise)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_week_day
  ON workout_sessions(week, day);
CREATE INDEX IF NOT EXISTS idx_sets_week_day
  ON workout_sets(week, day);
`;

let _db: DatabaseSync | null = null;

// Lazily open the database on first use so importing this module never
// touches the filesystem at build time.
export function getDb(): DatabaseSync {
  if (_db) return _db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  _db = db;
  return db;
}
