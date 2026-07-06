// Movement-specific warmup routines, keyed by lift — never by day label or
// exercise name. A day's warmup is the general block plus the blocks for the
// distinct lifts appearing in that day's exercises (from `ex.lift`), so any
// future program works with zero configuration.
//
// The preview screen shows the drills as an ephemeral pre-session checklist —
// nothing here is persisted.

import type { LiftId } from "./workout";
import type { ProgramDay } from "./workout-program";

export type WarmupDrill = {
  name: string;
  reps: string;
  note?: string;
};

export const GENERAL_WARMUP: WarmupDrill[] = [
  { name: "Bike / row (easy pace)", reps: "3–5 min" },
  { name: "Cat-cow", reps: "10 reps" },
];

export const LIFT_WARMUPS: Record<LiftId, WarmupDrill[]> = {
  squat: [
    { name: "Hip flexor stretch", reps: "60s/side" },
    { name: "Ankle circles", reps: "10 reps/side" },
    { name: "Goblet squat", reps: "2×10 light" },
    { name: "Hip airplane", reps: "5/side" },
    { name: "Pause squat (empty bar)", reps: "3×3" },
  ],
  bench: [
    { name: "Band pull-apart", reps: "2×20" },
    { name: "Shoulder circle", reps: "10/direction" },
    { name: "Thoracic extension on foam roller", reps: "60s" },
    { name: "Pushup", reps: "2×10" },
    { name: "Empty bar bench", reps: "2×10 slow" },
  ],
  deadlift: [
    { name: "Hip hinge drill", reps: "10 reps" },
    { name: "Good morning (empty bar)", reps: "2×10" },
    { name: "Lat pulldown (light)", reps: "2×10" },
    { name: "RDL (empty bar)", reps: "2×10" },
  ],
};

// Distinct lifts trained on a day, in order of first appearance.
export function liftsForDay(day: ProgramDay): LiftId[] {
  const lifts: LiftId[] = [];
  for (const ex of day.exercises) {
    if (ex.lift && !lifts.includes(ex.lift)) lifts.push(ex.lift);
  }
  return lifts;
}

// Warmup for a program day: general block + one block per distinct lift.
export function getWarmupForDay(day: ProgramDay): WarmupDrill[] {
  return [...GENERAL_WARMUP, ...liftsForDay(day).flatMap((l) => LIFT_WARMUPS[l])];
}
