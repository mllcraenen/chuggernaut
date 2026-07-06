// Swap alternatives derived structurally from the program (interim until the
// exercise registry, Phase 3): alternatives for an exercise are the other
// program exercises sharing the same `lift`, plus a small extra pool keyed by
// lift — never by exercise name. Accessories (lift = null) and unknown names
// get no suggestions; the swap UI falls back to free-text entry.

import type { LiftId } from "./workout";
import { PROGRAM } from "./workout-program";

// Extra movements per lift family, beyond what the program already contains.
const EXTRA_BY_LIFT: Record<LiftId, string[]> = {
  squat: ["Front Squat", "Belt Squat", "Leg Press", "Paused Squat"],
  bench: ["Close-grip Bench", "Incline Bench", "DB Bench Press", "Larsen Press"],
  deadlift: ["Trap Bar Deadlift", "Block Pull", "Deficit Deadlift", "Romanian Deadlift"],
};

// Lift of a program exercise, found by exact program membership (name is the
// program's identity key pre-registry, not a display-string pattern match).
export function liftOfProgramExercise(exercise: string): LiftId | null {
  for (const day of PROGRAM) {
    for (const ex of day.exercises) {
      if (ex.name === exercise) return ex.lift;
    }
  }
  return null;
}

export function getAlternatives(exercise: string): string[] {
  const lift = liftOfProgramExercise(exercise);
  if (!lift) return [];

  const names = new Set<string>();
  for (const day of PROGRAM) {
    for (const ex of day.exercises) {
      if (ex.lift === lift && ex.name !== exercise) names.add(ex.name);
    }
  }
  for (const extra of EXTRA_BY_LIFT[lift]) {
    if (extra !== exercise) names.add(extra);
  }
  return [...names];
}
