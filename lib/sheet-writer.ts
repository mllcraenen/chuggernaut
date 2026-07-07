// WorkoutSheetWriter — generalized spreadsheet writer for any workout program.
//
// Produces one tab per block. Each tab is a flat list of rows (one per set),
// with human-readable columns and a hidden key column that makes import
// trivially reversible without positional guessing.
//
// Key format: "week|day|setNumber|exercise name"
// Separator rows (day headers etc.) have an empty key and are skipped on import.

import type { ProgramDay, ProgramExercise, ProgramSet } from "./workout-program";
import type { TrainingMax, SetRow } from "./workout";

export type Cell = string | number;
export type Row = Cell[];

export interface BlockDefinition {
  name: string;
  weeks: number[];
}

export class WorkoutSheetWriter {
  private logMap: Map<string, SetRow>;

  constructor(
    private program: ProgramDay[],
    private blocks: BlockDefinition[],
    private tms: Record<string, TrainingMax>,
    loggedSets: SetRow[],
    // Per-exercise notes keyed by noteKey(week, day, exercise); rendered on
    // each exercise's first set row only (D4).
    private notes: Record<string, string> = {},
    // Exercises whose registry rep_mode is 'time' — their prescription cell
    // renders seconds prose ("45s") instead of a rep count. Logged cells stay
    // numeric (seconds) so the round-trip is unaffected.
    private timeExercises: Set<string> = new Set(),
  ) {
    this.logMap = new Map(
      loggedSets.map(s => [WorkoutSheetWriter.makeKey(s.week, s.day, s.setNumber, s.exercise), s])
    );
  }

  tabNames(): string[] {
    return this.blocks.map(b => b.name);
  }

  static readonly HEADER: Row = [
    "_key", "Week", "Day", "Session", "Exercise", "Set",
    "Prescribed", "Actual Weight (kg)", "Actual Reps", "RPE", "e1RM (kg)", "Notes",
  ];

  // Column index of the Notes cell (appended to the right — round-trip rule).
  static readonly NOTES_COL = WorkoutSheetWriter.HEADER.indexOf("Notes");

  static noteKey(week: number, day: number, exercise: string): string {
    return `${week}|${day}|${exercise}`;
  }

  // Key: week|day|setNumber|exercise — exercise is last so it may contain any chars
  static makeKey(week: number, day: number, setNumber: number, exercise: string): string {
    return `${week}|${day}|${setNumber}|${exercise}`;
  }

  static parseKey(raw: unknown): { week: number; day: number; setNumber: number; exercise: string } | null {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const idx = raw.indexOf("|");
    const idx2 = idx >= 0 ? raw.indexOf("|", idx + 1) : -1;
    const idx3 = idx2 >= 0 ? raw.indexOf("|", idx2 + 1) : -1;
    if (idx < 0 || idx2 < 0 || idx3 < 0) return null;
    const week = parseInt(raw.slice(0, idx), 10);
    const day = parseInt(raw.slice(idx + 1, idx2), 10);
    const setNumber = parseInt(raw.slice(idx2 + 1, idx3), 10);
    const exercise = raw.slice(idx3 + 1);
    if (!Number.isFinite(week) || !Number.isFinite(day) || !Number.isFinite(setNumber) || !exercise) return null;
    return { week, day, setNumber, exercise };
  }

  static prescribedLabel(
    set: ProgramSet,
    exercise: ProgramExercise,
    tms: Record<string, TrainingMax>,
    isTimeBased = false,
  ): string {
    const rpeStr = set.rpe != null ? ` @RPE${set.rpe}` : "";
    if (isTimeBased) return `${set.reps}s${rpeStr}`;
    if (set.percentOfTM != null && exercise.lift) {
      const tm = tms[exercise.lift]?.trainingMax;
      if (tm) {
        const weight = Math.round(tm * set.percentOfTM / 100 * 2) / 2;
        return `${weight}kg × ${set.reps}${rpeStr}`;
      }
      // TM not set yet — show percentage (percentOfTM is already a whole number)
      return `${Math.round(set.percentOfTM)}% × ${set.reps}${rpeStr}`;
    }
    // Accessory: no prescribed weight
    return `${set.reps} reps${rpeStr}`;
  }

  static setLabel(set: ProgramSet): string {
    return set.note ? `Set ${set.setNumber} (${set.note})` : `Set ${set.setNumber}`;
  }

  generateBlock(block: BlockDefinition): Row[] {
    const rows: Row[] = [];
    const sessions = this.program
      .filter(d => block.weeks.includes(d.week))
      .sort((a, b) => a.week !== b.week ? a.week - b.week : a.day - b.day);

    let lastDay = -1;
    for (const session of sessions) {
      // Day separator when the day number changes
      if (session.day !== lastDay) {
        rows.push(["", "", session.day, `=== Day ${session.day}: ${session.label} ===`, "", "", "", "", "", "", "", ""]);
        lastDay = session.day;
      }

      // Week sub-header
      rows.push(["", session.week, session.day, session.label, "", `— Week ${session.week} —`, "", "", "", "", "", ""]);

      const emittedKeys = new Set<string>();
      const noteEmitted = new Set<string>();

      for (const exercise of session.exercises) {
        const note = this.notes[WorkoutSheetWriter.noteKey(session.week, session.day, exercise.name)] ?? "";
        let firstSet = true;
        for (const set of exercise.sets) {
          const key = WorkoutSheetWriter.makeKey(session.week, session.day, set.setNumber, exercise.name);
          emittedKeys.add(key);
          const logged = this.logMap.get(key);
          rows.push([
            key,
            session.week,
            session.day,
            session.label,
            exercise.name,
            WorkoutSheetWriter.setLabel(set),
            WorkoutSheetWriter.prescribedLabel(set, exercise, this.tms, this.timeExercises.has(exercise.name)),
            logged?.actualWeight ?? "",
            logged?.actualReps ?? "",
            logged?.actualRpe ?? "",
            logged?.e1rm ?? "",
            firstSet ? note : "",
          ]);
          firstSet = false;
        }
        if (exercise.sets.length > 0) {
          noteEmitted.add(WorkoutSheetWriter.noteKey(session.week, session.day, exercise.name));
        }
      }

      // Logged sets beyond the prescription (extra accessory sets, or sets
      // logged under a swapped-in exercise name): real keys, empty
      // prescription cells. Without this they'd silently vanish from the sheet.
      const extras = [...this.logMap.values()]
        .filter(s =>
          s.week === session.week &&
          s.day === session.day &&
          !emittedKeys.has(WorkoutSheetWriter.makeKey(s.week, s.day, s.setNumber, s.exercise))
        )
        .sort((a, b) =>
          a.exercise !== b.exercise ? a.exercise.localeCompare(b.exercise) : a.setNumber - b.setNumber
        );
      for (const s of extras) {
        const nKey = WorkoutSheetWriter.noteKey(s.week, s.day, s.exercise);
        const note = noteEmitted.has(nKey) ? "" : (this.notes[nKey] ?? "");
        noteEmitted.add(nKey);
        rows.push([
          WorkoutSheetWriter.makeKey(s.week, s.day, s.setNumber, s.exercise),
          s.week,
          s.day,
          session.label,
          s.exercise,
          `Set ${s.setNumber} (extra)`,
          "",
          s.actualWeight ?? "",
          s.actualReps ?? "",
          s.actualRpe ?? "",
          s.e1rm ?? "",
          note,
        ]);
      }
    }

    return rows;
  }

  // Parse all rows from a block tab and return records suitable for DB upsert.
  // Rows with empty keys (separators/headers) are silently skipped.
  // Rows with no actual data (all blank) are also skipped.
  static parseBlockRows(rows: unknown[][]): Array<{
    week: number;
    day: number;
    exercise: string;
    setNumber: number;
    actualWeight: number | null;
    actualReps: number | null;
    actualRpe: number | null;
  }> {
    const results: ReturnType<typeof WorkoutSheetWriter.parseBlockRows> = [];

    for (const row of rows) {
      const parsed = WorkoutSheetWriter.parseKey(row[0]);
      if (!parsed) continue;

      const numOrNull = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const actualWeight = numOrNull(row[7]);
      const actualReps = numOrNull(row[8]);
      const actualRpe = numOrNull(row[9]);

      // Only upsert if at least one actual value is present
      if (actualWeight === null && actualReps === null && actualRpe === null) continue;

      results.push({
        week: parsed.week,
        day: parsed.day,
        exercise: parsed.exercise,
        setNumber: parsed.setNumber,
        actualWeight,
        actualReps,
        actualRpe,
      });
    }

    return results;
  }

  // Extract the note per (week, day, exercise) from each exercise's first set
  // row. Sheet is authoritative: an empty/missing cell means "no note", so
  // callers clear the stored note for combos returned with note === "".
  // Only call this when the tab's header row actually has a Notes column —
  // older sheets without it must leave DB notes untouched.
  static parseBlockNotes(rows: unknown[][]): Array<{
    week: number;
    day: number;
    exercise: string;
    note: string;
  }> {
    const results: ReturnType<typeof WorkoutSheetWriter.parseBlockNotes> = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const parsed = WorkoutSheetWriter.parseKey(row[0]);
      if (!parsed) continue;
      const key = WorkoutSheetWriter.noteKey(parsed.week, parsed.day, parsed.exercise);
      if (seen.has(key)) continue; // only the exercise's first set row carries the note
      seen.add(key);
      const raw = row[WorkoutSheetWriter.NOTES_COL];
      const note = raw === null || raw === undefined ? "" : String(raw).trim();
      results.push({ week: parsed.week, day: parsed.day, exercise: parsed.exercise, note });
    }

    return results;
  }
}
