// Monolith Meet Prep v7 — Lichtstad Cup (KNKF / IPF classic, Eindhoven) 28 Nov 2026
//
// Weeks 1–6 fully detailed (Jun 22 → end-July gate).
// 4 days/week: Day 1 Mon (squat + bench vol), Day 2 Tue (heavy pull + bench intensity),
//              Day 3 Thu (bench tech + light squat), Day 4 Sat (semi-optional, speed pull).
//
// TM = e1RM × 88%.  percentOfTM is stored as a whole number (e.g. 52 = 52% of TM).
// Accessories carry null percentOfTM; load is lifter's choice.

import type { LiftId } from "./workout";

export const PROGRAM_WEEKS = 6;
export const PROGRAM_DAYS = 4;

export type ProgramSet = {
  setNumber: number;
  percentOfTM: number | null;
  reps: number;
  rpe: number | null;
  note?: string;
};

export type ProgramExercise = {
  name: string;
  lift: LiftId | null;
  sets: ProgramSet[];
};

export type ProgramDay = {
  week: number;
  day: number;
  label: string;
  exercises: ProgramExercise[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function ms(
  count: number,
  pct: number,
  reps: number,
  rpe: number,
  note?: string
): ProgramSet[] {
  return Array.from({ length: count }, (_, i) => ({
    setNumber: i + 1,
    percentOfTM: pct,
    reps,
    rpe,
    note,
  }));
}

function as(
  count: number,
  reps: number,
  rpe: number | null = null,
  note?: string
): ProgramSet[] {
  return Array.from({ length: count }, (_, i) => ({
    setNumber: i + 1,
    percentOfTM: null,
    reps,
    rpe,
    note,
  }));
}

// ── Week 1: Re-entry ──────────────────────────────────────────────────────────

const W1D1: ProgramExercise[] = [
  { name: "SSB or High Bar Squat", lift: "squat", sets: ms(5, 52, 5, 5.5, "Under 100 kg twitch line. Rehab on-ramp.") },
  { name: "Bench Press", lift: "bench", sets: ms(5, 82, 5, 5.5, "Volume") },
  { name: "Paused Bench", lift: "bench", sets: ms(3, 73, 5, 6.5, "2s pause") },
  { name: "Row", lift: null, sets: as(4, 10, 8, "Upper back, 2 RIR") },
  { name: "Hamstring Curl", lift: null, sets: as(4, 12, null, "12–15 reps, hard") },
  { name: "Curls", lift: null, sets: as(4, 12, null, "12–15 reps, pump") },
  { name: "Adductor Rehab", lift: null, sets: as(3, 1, null, "20–30s holds, pain-free — see ladder in spreadsheet") },
];

const W1D2: ProgramExercise[] = [
  { name: "Sumo Deadlift (top)", lift: "deadlift", sets: ms(3, 76, 3, 6, "Build to top, then back off") },
  { name: "Sumo Deadlift (back-off)", lift: "deadlift", sets: ms(2, 67, 5, 6, "Crisp reps") },
  { name: "Dead-stop Pull 1–2\" off floor", lift: "deadlift", sets: ms(3, 64, 3, 6.5, "Mid-shin fix. Dead stop, no bounce.") },
  { name: "Leg Press / Hack Squat", lift: null, sets: as(3, 8, 7.5, "8–10 reps, leg drive, groin-safe") },
  { name: "Bench Press (single)", lift: "bench", sets: ms(1, 91, 1, 7, "Top single") },
  { name: "Bench Press (back-off)", lift: "bench", sets: ms(4, 82, 3, 6, "Speed / quality") },
  { name: "Pull-ups / Chins", lift: null, sets: as(3, 10, null, "Aim 30–50 total, clean reps") },
  { name: "Abs", lift: null, sets: as(3, 10, null, "Pick one, 10–15 reps") },
];

const W1D3: ProgramExercise[] = [
  { name: "Bench Press (paused / close-grip)", lift: "bench", sets: ms(3, 70, 5, 6.5, "Technique") },
  { name: "SSB or High Bar Squat (light)", lift: "squat", sets: ms(4, 39, 4, 5, "2nd squat exposure") },
  { name: "Incline DB / Close-grip Bench", lift: null, sets: as(3, 8, 7, "Elbow-friendly") },
  { name: "Chest-supported Row", lift: null, sets: as(4, 10, null, "10–12 reps, upper back 2 RIR") },
  { name: "Rear Delts / Face Pulls", lift: null, sets: as(3, 15, null, "15–25 reps, smooth") },
  { name: "Triceps Pushdown", lift: null, sets: as(3, 15, null, "15–20 reps, easy elbows") },
];

const W1D4: ProgramExercise[] = [
  { name: "Speed Sumo from floor", lift: "deadlift", sets: ms(7, 61, 3, 6, "Explosive off floor, ~60–70% TM") },
  { name: "RDL / Stiff-leg", lift: "deadlift", sets: ms(3, 55, 6, 6.5, "Reduced dose — back/ham health") },
  { name: "Hamstring Curl", lift: null, sets: as(5, 10, null, "10–15 reps, brutal") },
  { name: "Pull-ups / Chins", lift: null, sets: as(5, 10, null, "Aim 50 total, clean reps") },
  { name: "Dips", lift: null, sets: as(3, 8, null, "8–12 reps, pain-free — cut if elbow flares") },
  { name: "Curls", lift: null, sets: as(5, 10, null, "50–100 total pump") },
  { name: "Sled / Loaded Walk", lift: null, sets: as(1, 1, null, "10–30 m, moderate conditioning") },
];

// ── Week 2: Small bump ────────────────────────────────────────────────────────

const W2D1: ProgramExercise[] = [
  { name: "SSB or High Bar Squat", lift: "squat", sets: ms(5, 55, 5, 6, "Under 100 kg twitch line.") },
  { name: "Bench Press", lift: "bench", sets: ms(5, 84, 5, 6, "Volume") },
  { name: "Paused Bench", lift: "bench", sets: ms(3, 75, 5, 6.5, "2s pause") },
  { name: "Row", lift: null, sets: as(4, 10, 8, "Upper back, 2 RIR") },
  { name: "Hamstring Curl", lift: null, sets: as(4, 12, null, "12–15 reps, hard") },
  { name: "Curls", lift: null, sets: as(4, 12, null, "12–15 reps, pump") },
  { name: "Adductor Rehab", lift: null, sets: as(3, 1, null, "20–30s holds, pain-free") },
];

const W2D2: ProgramExercise[] = [
  { name: "Sumo Deadlift (top)", lift: "deadlift", sets: ms(3, 79, 3, 6.5, "Build to top, then back off") },
  { name: "Sumo Deadlift (back-off)", lift: "deadlift", sets: ms(2, 70, 5, 6, "Crisp reps") },
  { name: "Dead-stop Pull 1–2\" off floor", lift: "deadlift", sets: ms(3, 67, 3, 6.5, "Mid-shin fix. Dead stop, no bounce.") },
  { name: "Leg Press / Hack Squat", lift: null, sets: as(3, 8, 7.5, "8–10 reps, leg drive, groin-safe") },
  { name: "Bench Press (single)", lift: "bench", sets: ms(1, 95, 1, 7, "Top single") },
  { name: "Bench Press (back-off)", lift: "bench", sets: ms(4, 84, 3, 6, "Speed / quality") },
  { name: "Pull-ups / Chins", lift: null, sets: as(3, 10, null, "Aim 30–50 total, clean reps") },
  { name: "Abs", lift: null, sets: as(3, 10, null, "Pick one, 10–15 reps") },
];

const W2D3: ProgramExercise[] = [
  { name: "Bench Press (paused / close-grip)", lift: "bench", sets: ms(3, 73, 5, 6.5, "Technique") },
  { name: "SSB or High Bar Squat (light)", lift: "squat", sets: ms(4, 41, 4, 5, "2nd squat exposure") },
  { name: "Incline DB / Close-grip Bench", lift: null, sets: as(3, 8, 7, "Elbow-friendly") },
  { name: "Chest-supported Row", lift: null, sets: as(4, 10, null, "10–12 reps, upper back 2 RIR") },
  { name: "Rear Delts / Face Pulls", lift: null, sets: as(3, 15, null, "15–25 reps, smooth") },
  { name: "Triceps Pushdown", lift: null, sets: as(3, 15, null, "15–20 reps, easy elbows") },
];

const W2D4: ProgramExercise[] = [
  { name: "Speed Sumo from floor", lift: "deadlift", sets: ms(7, 66, 2, 6, "Explosive off floor, ~60–70% TM") },
  { name: "RDL / Stiff-leg", lift: "deadlift", sets: ms(3, 58, 6, 6.5, "Reduced dose — back/ham health") },
  { name: "Hamstring Curl", lift: null, sets: as(5, 10, null, "10–15 reps, brutal") },
  { name: "Pull-ups / Chins", lift: null, sets: as(5, 10, null, "Aim 50 total, clean reps") },
  { name: "Dips", lift: null, sets: as(3, 8, null, "8–12 reps, pain-free") },
  { name: "Curls", lift: null, sets: as(5, 10, null, "50–100 total pump") },
  { name: "Sled / Loaded Walk", lift: null, sets: as(1, 1, null, "10–30 m, moderate conditioning") },
];

// ── Week 3: Light singles in ──────────────────────────────────────────────────

const W3D1: ProgramExercise[] = [
  { name: "SSB or High Bar Squat", lift: "squat", sets: ms(4, 58, 6, 6.5, "Still under ~100 kg.") },
  { name: "Bench Press", lift: "bench", sets: ms(5, 86, 5, 6, "Volume") },
  { name: "Paused Bench", lift: "bench", sets: ms(3, 75, 5, 6.5, "2s pause") },
  { name: "Row", lift: null, sets: as(4, 10, 8, "Upper back, 2 RIR") },
  { name: "Hamstring Curl", lift: null, sets: as(4, 12, null, "12–15 reps, hard") },
  { name: "Curls", lift: null, sets: as(4, 12, null, "12–15 reps, pump") },
  { name: "Adductor Rehab", lift: null, sets: as(3, 1, null, "20–30s holds, pain-free") },
];

const W3D2: ProgramExercise[] = [
  {
    name: "Sumo Deadlift (top)",
    lift: "deadlift",
    sets: [{ setNumber: 1, percentOfTM: 87, reps: 1, rpe: 7, note: "First real top single — build to it" }],
  },
  { name: "Sumo Deadlift (back-off)", lift: "deadlift", sets: ms(3, 80, 3, 6, "Crisp reps") },
  { name: "Dead-stop Pull 1–2\" off floor", lift: "deadlift", sets: ms(3, 70, 3, 6.5, "Mid-shin fix. Dead stop, no bounce.") },
  { name: "Leg Press / Hack Squat", lift: null, sets: as(3, 8, 7.5, "8–10 reps, leg drive, groin-safe") },
  { name: "Bench Press (single)", lift: "bench", sets: ms(1, 98, 1, 8, "Top single") },
  { name: "Bench Press (back-off)", lift: "bench", sets: ms(3, 86, 3, 6, "Speed / quality") },
  { name: "Pull-ups / Chins", lift: null, sets: as(3, 10, null, "Aim 30–50 total, clean reps") },
  { name: "Abs", lift: null, sets: as(3, 10, null, "Pick one, 10–15 reps") },
];

const W3D3: ProgramExercise[] = [
  { name: "Bench Press (paused / close-grip)", lift: "bench", sets: ms(3, 75, 5, 6.5, "Technique") },
  { name: "SSB or High Bar Squat (light)", lift: "squat", sets: ms(4, 42, 4, 5, "2nd squat exposure") },
  { name: "Incline DB / Close-grip Bench", lift: null, sets: as(3, 8, 7, "Elbow-friendly") },
  { name: "Chest-supported Row", lift: null, sets: as(4, 10, null, "10–12 reps, upper back 2 RIR") },
  { name: "Rear Delts / Face Pulls", lift: null, sets: as(3, 15, null, "15–25 reps, smooth") },
  { name: "Triceps Pushdown", lift: null, sets: as(3, 15, null, "15–20 reps, easy elbows") },
];

const W3D4: ProgramExercise[] = [
  { name: "Speed Sumo from floor", lift: "deadlift", sets: ms(8, 70, 2, 6, "Explosive off floor, ~60–70% TM") },
  { name: "RDL / Stiff-leg", lift: "deadlift", sets: ms(3, 61, 6, 6.5, "Reduced dose — back/ham health") },
  { name: "Hamstring Curl", lift: null, sets: as(5, 10, null, "10–15 reps, brutal") },
  { name: "Pull-ups / Chins", lift: null, sets: as(5, 10, null, "Aim 50 total, clean reps") },
  { name: "Dips", lift: null, sets: as(3, 8, null, "8–12 reps, pain-free") },
  { name: "Curls", lift: null, sets: as(5, 10, null, "50–100 total pump") },
  { name: "Sled / Loaded Walk", lift: null, sets: as(1, 1, null, "10–30 m, moderate conditioning") },
];

// ── Week 4: Deload ────────────────────────────────────────────────────────────

const W4D1: ProgramExercise[] = [
  { name: "SSB or High Bar Squat", lift: "squat", sets: ms(3, 49, 5, 5, "Deload.") },
  { name: "Bench Press", lift: "bench", sets: ms(4, 73, 5, 5, "Volume") },
  { name: "Paused Bench", lift: "bench", sets: ms(3, 66, 5, 6.5, "2s pause") },
  { name: "Row", lift: null, sets: as(4, 10, 8, "Upper back, 2 RIR") },
  { name: "Hamstring Curl", lift: null, sets: as(4, 12, null, "12–15 reps, hard") },
  { name: "Curls", lift: null, sets: as(4, 12, null, "12–15 reps, pump") },
  { name: "Adductor Rehab", lift: null, sets: as(3, 1, null, "20–30s holds, pain-free") },
];

const W4D2: ProgramExercise[] = [
  { name: "Sumo Deadlift (top)", lift: "deadlift", sets: ms(3, 70, 3, 5, "Deload — feel fast") },
  { name: "Sumo Deadlift (back-off)", lift: "deadlift", sets: ms(1, 64, 5, 6, "Crisp reps") },
  { name: "Dead-stop Pull 1–2\" off floor", lift: "deadlift", sets: ms(3, 58, 3, 6.5, "Mid-shin fix. Dead stop, no bounce.") },
  { name: "Leg Press / Hack Squat", lift: null, sets: as(3, 8, 7.5, "8–10 reps, leg drive, groin-safe") },
  { name: "Bench Press (single)", lift: "bench", sets: ms(1, 86, 1, 6, "Top single") },
  { name: "Bench Press (back-off)", lift: "bench", sets: ms(3, 75, 3, 6, "Speed / quality") },
  { name: "Pull-ups / Chins", lift: null, sets: as(3, 10, null, "Aim 30–50 total, clean reps") },
  { name: "Abs", lift: null, sets: as(3, 10, null, "Pick one, 10–15 reps") },
];

const W4D3: ProgramExercise[] = [
  { name: "Bench Press (paused / close-grip)", lift: "bench", sets: ms(3, 66, 5, 6.5, "Technique") },
  { name: "SSB or High Bar Squat (light)", lift: "squat", sets: ms(4, 36, 4, 5, "2nd squat exposure, deload load") },
  { name: "Incline DB / Close-grip Bench", lift: null, sets: as(3, 8, 7, "Elbow-friendly") },
  { name: "Chest-supported Row", lift: null, sets: as(4, 10, null, "10–12 reps, upper back 2 RIR") },
  { name: "Rear Delts / Face Pulls", lift: null, sets: as(3, 15, null, "15–25 reps, smooth") },
  { name: "Triceps Pushdown", lift: null, sets: as(3, 15, null, "15–20 reps, easy elbows") },
];

const W4D4: ProgramExercise[] = [
  { name: "Speed Sumo from floor", lift: "deadlift", sets: ms(5, 58, 2, 6, "Explosive off floor, ~60–70% TM") },
  { name: "RDL / Stiff-leg", lift: "deadlift", sets: ms(3, 52, 6, 6.5, "Reduced dose — back/ham health") },
  { name: "Hamstring Curl", lift: null, sets: as(5, 10, null, "10–15 reps, brutal") },
  { name: "Pull-ups / Chins", lift: null, sets: as(5, 10, null, "Aim 50 total, clean reps") },
  { name: "Dips", lift: null, sets: as(3, 8, null, "8–12 reps, pain-free") },
  { name: "Curls", lift: null, sets: as(5, 10, null, "50–100 total pump") },
  { name: "Sled / Loaded Walk", lift: null, sets: as(1, 1, null, "10–30 m, moderate conditioning") },
];

// ── Week 5: Straight bar, squat crosses 100 ───────────────────────────────────

const W5D1: ProgramExercise[] = [
  {
    name: "Straight High Bar Squat",
    lift: "squat",
    sets: ms(4, 65, 3, 6.5, "SWITCH off SSB. First work across 100 kg — only if squeeze check clean. Window 90–100; symptoms set the top. Stop >3/10."),
  },
  { name: "Bench Press", lift: "bench", sets: ms(5, 89, 5, 7, "Volume") },
  { name: "Paused Bench", lift: "bench", sets: ms(3, 77, 5, 6.5, "2s pause") },
  { name: "Row", lift: null, sets: as(4, 10, 8, "Upper back, 2 RIR") },
  { name: "Hamstring Curl", lift: null, sets: as(4, 12, null, "12–15 reps, hard") },
  { name: "Curls", lift: null, sets: as(4, 12, null, "12–15 reps, pump") },
  { name: "Adductor Rehab", lift: null, sets: as(3, 1, null, "20–30s holds, pain-free") },
];

const W5D2: ProgramExercise[] = [
  {
    name: "Sumo Deadlift (top)",
    lift: "deadlift",
    sets: [{ setNumber: 1, percentOfTM: 93, reps: 1, rpe: 7.5, note: "Heavy single — build to it" }],
  },
  { name: "Sumo Deadlift (back-off)", lift: "deadlift", sets: ms(3, 84, 3, 6, "Crisp reps") },
  { name: "Dead-stop Pull 1–2\" off floor", lift: "deadlift", sets: ms(3, 73, 3, 6.5, "Mid-shin fix. Dead stop, no bounce.") },
  { name: "Leg Press / Hack Squat", lift: null, sets: as(3, 8, 7.5, "8–10 reps, leg drive, groin-safe") },
  { name: "Bench Press (single)", lift: "bench", sets: ms(1, 100, 1, 8, "Top single — matches TM") },
  { name: "Bench Press (back-off)", lift: "bench", sets: ms(3, 89, 3, 6, "Speed / quality") },
  { name: "Pull-ups / Chins", lift: null, sets: as(3, 10, null, "Aim 30–50 total, clean reps") },
  { name: "Abs", lift: null, sets: as(3, 10, null, "Pick one, 10–15 reps") },
];

const W5D3: ProgramExercise[] = [
  { name: "Bench Press (paused / close-grip)", lift: "bench", sets: ms(3, 77, 5, 6.5, "Technique") },
  { name: "High Bar Squat (light)", lift: "squat", sets: ms(4, 45, 4, 5, "2nd squat exposure") },
  { name: "Incline DB / Close-grip Bench", lift: null, sets: as(3, 8, 7, "Elbow-friendly") },
  { name: "Chest-supported Row", lift: null, sets: as(4, 10, null, "10–12 reps, upper back 2 RIR") },
  { name: "Rear Delts / Face Pulls", lift: null, sets: as(3, 15, null, "15–25 reps, smooth") },
  { name: "Triceps Pushdown", lift: null, sets: as(3, 15, null, "15–20 reps, easy elbows") },
];

const W5D4: ProgramExercise[] = [
  { name: "Speed Sumo from floor", lift: "deadlift", sets: ms(7, 71, 2, 6, "Explosive off floor, ~60–70% TM") },
  { name: "RDL / Stiff-leg", lift: "deadlift", sets: ms(3, 63, 6, 6.5, "Reduced dose — back/ham health") },
  { name: "Hamstring Curl", lift: null, sets: as(5, 10, null, "10–15 reps, brutal") },
  { name: "Pull-ups / Chins", lift: null, sets: as(5, 10, null, "Aim 50 total, clean reps") },
  { name: "Dips", lift: null, sets: as(3, 8, null, "8–12 reps, pain-free") },
  { name: "Curls", lift: null, sets: as(5, 10, null, "50–100 total pump") },
  { name: "Sled / Loaded Walk", lift: null, sets: as(1, 1, null, "10–30 m, moderate conditioning") },
];

// ── Week 6: Base build + end-July gate ───────────────────────────────────────

const W6D1: ProgramExercise[] = [
  {
    name: "Straight High Bar Squat (gate test)",
    lift: "squat",
    sets: [{ setNumber: 1, percentOfTM: 78, reps: 1, rpe: 7.5, note: "GATE TEST: past 120–130 kg ≤3/10, no next-day flare = green for August. Stalls or flares: hold load, extend base, book physio." }],
  },
  { name: "Straight High Bar Squat (back-off)", lift: "squat", sets: ms(3, 65, 3, 6, "Crisp reps") },
  {
    name: "Low Bar Squat (feeler)",
    lift: "squat",
    sets: ms(2, 45, 3, 5, "Mobility-led position test only. Skip if elbow or groin complain."),
  },
  { name: "Bench Press", lift: "bench", sets: ms(5, 91, 4, 7, "Volume") },
  { name: "Paused Bench", lift: "bench", sets: ms(3, 80, 5, 6.5, "2s pause") },
  { name: "Row", lift: null, sets: as(4, 10, 8, "Upper back, 2 RIR") },
  { name: "Hamstring Curl", lift: null, sets: as(4, 12, null, "12–15 reps, hard") },
  { name: "Curls", lift: null, sets: as(4, 12, null, "12–15 reps, pump") },
  { name: "Adductor Rehab", lift: null, sets: as(3, 1, null, "20–30s holds, pain-free") },
];

const W6D2: ProgramExercise[] = [
  {
    name: "Sumo Deadlift (top)",
    lift: "deadlift",
    sets: [{ setNumber: 1, percentOfTM: 99, reps: 1, rpe: 8, note: "End-July rebaseline — log this single to update e1RM in settings" }],
  },
  { name: "Sumo Deadlift (back-off)", lift: "deadlift", sets: ms(3, 89, 3, 6, "Crisp reps") },
  { name: "Dead-stop Pull 1–2\" off floor", lift: "deadlift", sets: ms(3, 77, 3, 6.5, "Mid-shin fix. Dead stop, no bounce.") },
  { name: "Leg Press / Hack Squat", lift: null, sets: as(3, 8, 7.5, "8–10 reps, leg drive, groin-safe") },
  {
    name: "Bench Press (single)",
    lift: "bench",
    sets: [{ setNumber: 1, percentOfTM: 105, reps: 1, rpe: 8, note: "End-July rebaseline — log this single to update bench e1RM in settings" }],
  },
  { name: "Bench Press (back-off)", lift: "bench", sets: ms(3, 91, 3, 6, "Speed / quality") },
  { name: "Pull-ups / Chins", lift: null, sets: as(3, 10, null, "Aim 30–50 total, clean reps") },
  { name: "Abs", lift: null, sets: as(3, 10, null, "Pick one, 10–15 reps") },
];

const W6D3: ProgramExercise[] = [
  { name: "Bench Press (paused / close-grip)", lift: "bench", sets: ms(3, 80, 5, 6.5, "Technique") },
  { name: "High Bar Squat (light)", lift: "squat", sets: ms(4, 49, 3, 5, "2nd squat exposure") },
  { name: "Incline DB / Close-grip Bench", lift: null, sets: as(3, 8, 7, "Elbow-friendly") },
  { name: "Chest-supported Row", lift: null, sets: as(4, 10, null, "10–12 reps, upper back 2 RIR") },
  { name: "Rear Delts / Face Pulls", lift: null, sets: as(3, 15, null, "15–25 reps, smooth") },
  { name: "Triceps Pushdown", lift: null, sets: as(3, 15, null, "15–20 reps, easy elbows") },
];

const W6D4: ProgramExercise[] = [
  { name: "Speed Sumo from floor", lift: "deadlift", sets: ms(7, 76, 2, 6, "Explosive off floor, ~60–70% TM") },
  { name: "RDL / Stiff-leg", lift: "deadlift", sets: ms(3, 64, 6, 6.5, "Reduced dose — back/ham health") },
  { name: "Hamstring Curl", lift: null, sets: as(5, 10, null, "10–15 reps, brutal") },
  { name: "Pull-ups / Chins", lift: null, sets: as(5, 10, null, "Aim 50 total, clean reps") },
  { name: "Dips", lift: null, sets: as(3, 8, null, "8–12 reps, pain-free") },
  { name: "Curls", lift: null, sets: as(5, 10, null, "50–100 total pump") },
  { name: "Sled / Loaded Walk", lift: null, sets: as(1, 1, null, "10–30 m, moderate conditioning") },
];

// ── Assemble ──────────────────────────────────────────────────────────────────

const DAYS_MAP: [number, number, string, ProgramExercise[]][] = [
  [1, 1, "Monday — Squat + Bench Volume", W1D1],
  [1, 2, "Tuesday — Heavy Pull + Bench Intensity", W1D2],
  [1, 3, "Thursday — Bench Technique + Light Squat", W1D3],
  [1, 4, "Saturday — SEMI-OPTIONAL: Speed Pull + Conditioning", W1D4],
  [2, 1, "Monday — Squat + Bench Volume", W2D1],
  [2, 2, "Tuesday — Heavy Pull + Bench Intensity", W2D2],
  [2, 3, "Thursday — Bench Technique + Light Squat", W2D3],
  [2, 4, "Saturday — SEMI-OPTIONAL: Speed Pull + Conditioning", W2D4],
  [3, 1, "Monday — Squat + Bench Volume", W3D1],
  [3, 2, "Tuesday — Heavy Pull + Bench Intensity", W3D2],
  [3, 3, "Thursday — Bench Technique + Light Squat", W3D3],
  [3, 4, "Saturday — SEMI-OPTIONAL: Speed Pull + Conditioning", W3D4],
  [4, 1, "Monday — Squat + Bench Volume [DELOAD]", W4D1],
  [4, 2, "Tuesday — Heavy Pull + Bench Intensity [DELOAD]", W4D2],
  [4, 3, "Thursday — Bench Technique + Light Squat [DELOAD]", W4D3],
  [4, 4, "Saturday — SEMI-OPTIONAL: Speed Pull + Conditioning [DELOAD]", W4D4],
  [5, 1, "Monday — Squat + Bench Volume", W5D1],
  [5, 2, "Tuesday — Heavy Pull + Bench Intensity", W5D2],
  [5, 3, "Thursday — Bench Technique + Light Squat", W5D3],
  [5, 4, "Saturday — SEMI-OPTIONAL: Speed Pull + Conditioning", W5D4],
  [6, 1, "Monday — Squat + Bench Volume [GATE TEST]", W6D1],
  [6, 2, "Tuesday — Heavy Pull + Bench Intensity [REBASELINE]", W6D2],
  [6, 3, "Thursday — Bench Technique + Light Squat", W6D3],
  [6, 4, "Saturday — SEMI-OPTIONAL: Speed Pull + Conditioning", W6D4],
];

export const PROGRAM: ProgramDay[] = DAYS_MAP.map(([week, day, label, exercises]) => ({
  week,
  day,
  label,
  exercises,
}));

export function getProgramDay(week: number, day: number): ProgramDay | undefined {
  return PROGRAM.find((d) => d.week === week && d.day === day);
}

export function mainLifts(day: ProgramDay): string[] {
  return day.exercises.filter((e) => e.lift !== null).map((e) => e.name);
}

export function roundToPlate(weight: number, step = 2.5): number {
  return Math.round(weight / step) * step;
}

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
