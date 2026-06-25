// Movement-specific warmup routines, keyed by program day label.
//
// Each program day in the Calgary Barbell split carries a `label` such as
// "Squat Focus" / "Bench Focus" / "Press Focus" / "Deadlift Focus" (see
// lib/workout-program.ts). The preview screen shows the matching warmup drills
// as an ephemeral pre-session checklist — nothing here is persisted.

export type WarmupDrill = {
  name: string;
  reps: string;
  note?: string;
};

const WARMUP_ROUTINES: Record<string, WarmupDrill[]> = {
  "Squat Focus": [
    { name: "Hip flexor stretch", reps: "60s/side" },
    { name: "Ankle circles", reps: "10 reps/side" },
    { name: "Goblet squat", reps: "2×10 light" },
    { name: "Hip airplane", reps: "5/side" },
    { name: "Pause squat (empty bar)", reps: "3×3" },
  ],
  "Bench Focus": [
    { name: "Band pull-apart", reps: "2×20" },
    { name: "Shoulder circle", reps: "10/direction" },
    { name: "Thoracic extension on foam roller", reps: "60s" },
    { name: "Pushup", reps: "2×10" },
    { name: "Empty bar bench", reps: "2×10 slow" },
  ],
  "Press Focus": [
    { name: "Lat stretch", reps: "30s/side" },
    { name: "Shoulder rotation", reps: "10/direction" },
    { name: "Face pull (light)", reps: "2×15" },
    { name: "Z-press (empty bar)", reps: "2×5" },
    { name: "Overhead reach", reps: "10 reps" },
  ],
  "Deadlift Focus": [
    { name: "Hip hinge drill", reps: "10 reps" },
    { name: "Good morning (empty bar)", reps: "2×10" },
    { name: "Lat pulldown (light)", reps: "2×10" },
    { name: "RDL (empty bar)", reps: "2×10" },
    { name: "Cat-cow", reps: "10 reps" },
  ],
};

/**
 * Return the warmup drills for a given program day label. Unknown labels yield
 * an empty array so callers can render gracefully without guarding.
 */
export function getWarmup(label: string): WarmupDrill[] {
  return WARMUP_ROUTINES[label] ?? [];
}
