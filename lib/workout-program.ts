// Calgary Barbell 16-week powerlifting program.
//
// The full program is materialised as the exported `PROGRAM` constant: 16 weeks
// x 4 days = 64 ProgramDay entries. Main lifts are prescribed as a percentage of
// the lifter's training max (TM); accessories carry a fixed rep target and no
// percentage (the lifter picks the load).
//
// Periodisation follows the CB structure of four ~4-week blocks that ramp from
// volume accumulation into a strength/intensity peak, with a lighter deload at
// the end of each block and a peak/test week to close.
//
// Reference: https://docs.google.com/spreadsheets/d/10j2dFsc6h6_zxAsTrBlFjNhsRfyxQb-J9MwWECQbdEE/edit

import type { LiftId } from "./workout";

export const PROGRAM_WEEKS = 16;
export const PROGRAM_DAYS = 4;

export type ProgramSet = {
  setNumber: number;
  percentOfTM: number | null; // null for accessories (fixed-weight, lifter's choice)
  reps: number;
  rpe: number | null;
  note?: string;
};

export type ProgramExercise = {
  name: string;
  lift: LiftId | null; // null = accessory (not tied to a training max)
  sets: ProgramSet[];
};

export type ProgramDay = {
  week: number;
  day: number;
  label: string; // e.g. "Squat Focus"
  exercises: ProgramExercise[];
};

// ----- Day templates (the 4-day weekly split) -----

type SlotKind = "primary" | "secondary";

type MainSlot = {
  kind: SlotKind;
  lift: LiftId;
  name: string;
};

type AccessorySlot = {
  kind: "accessory";
  name: string;
  sets: number;
  reps: number;
  rpe: number | null;
};

type Slot = MainSlot | AccessorySlot;

type DayTemplate = {
  day: number;
  label: string;
  slots: Slot[];
};

// Each main lift gets one "primary" (heaviest) day per week; bench appears twice
// (it usually recovers fastest), squat and deadlift get a lighter secondary
// exposure on their off-day.
const DAY_TEMPLATES: DayTemplate[] = [
  {
    day: 1,
    label: "Squat Focus",
    slots: [
      { kind: "primary", lift: "squat", name: "Competition Squat" },
      { kind: "secondary", lift: "bench", name: "Competition Bench" },
      { kind: "accessory", name: "Romanian Deadlift", sets: 3, reps: 8, rpe: 8 },
      { kind: "accessory", name: "Leg Press", sets: 3, reps: 12, rpe: null },
      { kind: "accessory", name: "Leg Curl", sets: 3, reps: 12, rpe: null },
      { kind: "accessory", name: "Ab Work", sets: 3, reps: 15, rpe: null },
    ],
  },
  {
    day: 2,
    label: "Bench Focus",
    slots: [
      { kind: "primary", lift: "bench", name: "Competition Bench" },
      { kind: "secondary", lift: "deadlift", name: "Deficit Deadlift" },
      { kind: "accessory", name: "Barbell Row", sets: 4, reps: 10, rpe: 8 },
      { kind: "accessory", name: "Triceps Pushdown", sets: 3, reps: 12, rpe: null },
      { kind: "accessory", name: "Face Pull", sets: 3, reps: 15, rpe: null },
      { kind: "accessory", name: "Bicep Curl", sets: 3, reps: 12, rpe: null },
    ],
  },
  {
    day: 3,
    label: "Press Focus",
    slots: [
      { kind: "primary", lift: "ohp", name: "Overhead Press" },
      { kind: "secondary", lift: "squat", name: "Paused Squat" },
      { kind: "accessory", name: "Pull-ups", sets: 3, reps: 8, rpe: 8 },
      { kind: "accessory", name: "Lateral Raise", sets: 3, reps: 15, rpe: null },
      { kind: "accessory", name: "Rear Delt Fly", sets: 3, reps: 15, rpe: null },
      { kind: "accessory", name: "Ab Work", sets: 3, reps: 15, rpe: null },
    ],
  },
  {
    day: 4,
    label: "Deadlift Focus",
    slots: [
      { kind: "primary", lift: "deadlift", name: "Competition Deadlift" },
      { kind: "secondary", lift: "bench", name: "Close-Grip Bench" },
      { kind: "accessory", name: "Chest-Supported Row", sets: 4, reps: 10, rpe: 8 },
      { kind: "accessory", name: "Face Pull", sets: 3, reps: 15, rpe: null },
      { kind: "accessory", name: "Tricep Extension", sets: 3, reps: 12, rpe: null },
      { kind: "accessory", name: "Ab Work", sets: 3, reps: 15, rpe: null },
    ],
  },
];

// ----- Weekly intensity scheme -----

// Top set [percentOfTM, reps, rpe] for the primary lift, indexed by week (0-15).
// Four blocks: accumulation -> intensification -> heavy -> peak, each closing
// with a lighter week.
const PRIMARY_TOP: [number, number, number][] = [
  [72.5, 5, 7], [75, 5, 7.5], [77.5, 4, 8], [70, 5, 7], // wk 1-4  accumulation
  [77.5, 4, 8], [80, 4, 8.5], [82.5, 3, 9], [72.5, 4, 7.5], // wk 5-8  intensification
  [82.5, 3, 8.5], [85, 3, 9], [87.5, 2, 9], [75, 3, 7.5], // wk 9-12 heavy
  [87.5, 2, 9], [90, 1, 9.5], [92.5, 1, 9.5], [80, 2, 8], // wk 13-16 peak / deload
];

// Round a percentage to the nearest 0.5 so prescribed loads stay tidy.
function half(n: number): number {
  return Math.round(n * 2) / 2;
}

function buildPrimarySets(weekIdx: number): ProgramSet[] {
  const [pct, reps, rpe] = PRIMARY_TOP[weekIdx];
  const peak = weekIdx >= 12; // peak/der blocks run a single back-off
  const sets: ProgramSet[] = [
    { setNumber: 1, percentOfTM: pct, reps, rpe, note: "Top set" },
  ];
  const backoffs = peak ? 1 : 2;
  const boPct = half(pct - 10);
  for (let i = 0; i < backoffs; i++) {
    sets.push({
      setNumber: i + 2,
      percentOfTM: boPct,
      reps: reps + 1,
      rpe: Math.max(6, half(rpe - 1)),
      note: "Back-off",
    });
  }
  return sets;
}

function buildSecondarySets(weekIdx: number): ProgramSet[] {
  const [pct, reps, rpe] = PRIMARY_TOP[weekIdx];
  const sPct = half(pct - 12.5);
  const sReps = Math.min(reps + 2, 8);
  const sRpe = Math.max(6, half(rpe - 1.5));
  return [1, 2, 3].map((n) => ({
    setNumber: n,
    percentOfTM: sPct,
    reps: sReps,
    rpe: sRpe,
  }));
}

function buildAccessorySets(a: AccessorySlot): ProgramSet[] {
  return Array.from({ length: a.sets }, (_, i) => ({
    setNumber: i + 1,
    percentOfTM: null,
    reps: a.reps,
    rpe: a.rpe,
  }));
}

function buildExercises(weekIdx: number, tpl: DayTemplate): ProgramExercise[] {
  return tpl.slots.map((slot) => {
    if (slot.kind === "accessory") {
      return { name: slot.name, lift: null, sets: buildAccessorySets(slot) };
    }
    const sets =
      slot.kind === "primary"
        ? buildPrimarySets(weekIdx)
        : buildSecondarySets(weekIdx);
    return { name: slot.name, lift: slot.lift, sets };
  });
}

function buildProgram(): ProgramDay[] {
  const days: ProgramDay[] = [];
  for (let week = 1; week <= PROGRAM_WEEKS; week++) {
    for (const tpl of DAY_TEMPLATES) {
      days.push({
        week,
        day: tpl.day,
        label: tpl.label,
        exercises: buildExercises(week - 1, tpl),
      });
    }
  }
  return days;
}

// The full 64-day program. Built once at module load.
export const PROGRAM: ProgramDay[] = buildProgram();

// ----- Helpers -----

export function getProgramDay(week: number, day: number): ProgramDay | undefined {
  return PROGRAM.find((d) => d.week === week && d.day === day);
}

// Names of the main (TM-driven) lifts trained on a day, in order.
export function mainLifts(day: ProgramDay): string[] {
  return day.exercises.filter((e) => e.lift !== null).map((e) => e.name);
}

// Round a working weight to the nearest loadable increment (default 2.5 kg).
export function roundToPlate(weight: number, step = 2.5): number {
  return Math.round(weight / step) * step;
}

// Prescribed working weight for a set given the lift's training max.
// Returns null for accessories (no percentage / no TM).
export function prescribedWeight(
  trainingMax: number | undefined,
  percentOfTM: number | null,
  step = 2.5
): number | null {
  if (percentOfTM == null || trainingMax == null || !Number.isFinite(trainingMax)) {
    return null;
  }
  return roundToPlate((trainingMax * percentOfTM) / 100, step);
}
