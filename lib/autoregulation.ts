// Adaptive RPE autoregulation — pure functions, no side effects, no DB access.
//
// After a session, each working set carries a prescribed RPE and the RPE the
// lifter actually reported. By comparing the two through a standard
// load-vs-RPE table we can back out an "implied" training max per lift and
// nudge the stored TM toward it (heavily damped, capped, and always subject to
// explicit user approval upstream).

import type { LiftId, TrainingMax } from "./workout";

// Standard powerlifting RPE table. RPE_TABLE[reps][rpe] = fraction of 1RM that
// a set of `reps` reps at `rpe` represents. Each RPE point ≈ 3%, each rep ≈ 3%.
export const RPE_TABLE: Record<number, Record<number, number>> = {
  1: { 6: 0.91, 7: 0.93, 8: 0.96, 9: 0.98, 10: 1.0 },
  2: { 6: 0.88, 7: 0.91, 8: 0.93, 9: 0.96, 10: 0.98 },
  3: { 6: 0.85, 7: 0.88, 8: 0.91, 9: 0.93, 10: 0.96 },
  4: { 6: 0.82, 7: 0.85, 8: 0.88, 9: 0.91, 10: 0.93 },
  5: { 6: 0.79, 7: 0.82, 8: 0.85, 9: 0.88, 10: 0.91 },
  6: { 6: 0.76, 7: 0.79, 8: 0.82, 9: 0.85, 10: 0.88 },
  7: { 6: 0.73, 7: 0.76, 8: 0.79, 9: 0.82, 10: 0.85 },
  8: { 6: 0.7, 7: 0.73, 8: 0.76, 9: 0.79, 10: 0.82 },
  9: { 6: 0.67, 7: 0.7, 8: 0.73, 9: 0.76, 10: 0.79 },
  10: { 6: 0.64, 7: 0.67, 8: 0.7, 9: 0.73, 10: 0.76 },
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round05(value: number): number {
  return Math.round(value * 2) / 2;
}

// Fraction of 1RM for a given reps/RPE. Reps are clamped to 1–10 (rounded to a
// whole rep), RPE clamped to 6–10. Fractional RPE (e.g. 7.5 from the 0.5-step
// slider) is linearly interpolated between the two bounding integer columns.
export function rpeLoadFactor(reps: number, rpe: number): number {
  const r = clamp(Math.round(reps), 1, 10);
  const e = clamp(rpe, 6, 10);
  const row = RPE_TABLE[r];
  const lo = Math.floor(e);
  const hi = Math.ceil(e);
  if (lo === hi) return row[lo];
  const frac = e - lo;
  return row[lo] + (row[hi] - row[lo]) * frac;
}

// Back out the training max implied by a single set.
//   actualFactor      — load fraction for the reps at the REPORTED RPE
//   prescribedFactor  — load fraction for the reps at the PRESCRIBED RPE
//   idealWeight       — the weight that WOULD have hit the prescribed RPE
//   impliedTm         — that ideal weight expressed back through the set's %TM
// Higher reported RPE than prescribed → the set felt heavy → lower implied TM.
export function impliedTm(
  actualWeight: number,
  reps: number,
  actualRpe: number,
  prescribedRpe: number,
  prescribedPercent: number
): number {
  const actualFactor = rpeLoadFactor(reps, actualRpe);
  const prescribedFactor = rpeLoadFactor(reps, prescribedRpe);
  const idealWeight = actualWeight * (prescribedFactor / actualFactor);
  const tm = idealWeight / (prescribedPercent / 100);
  return round05(tm);
}

// One set's worth of input. `lift` is null for accessories (ignored).
export interface AutoregSet {
  lift: LiftId | null;
  setNumber: number;
  prescribedPercent: number | null;
  prescribedRpe: number | null;
  actualWeight: number | null;
  actualReps: number | null;
  actualRpe: number | null;
}

export interface AdjustmentSuggestion {
  lift: LiftId;
  currentTm: number;
  suggestedTm: number;
  deltaKg: number;
  deltaPct: number;
  setsUsed: number;
}

// Damping factor: move only part of the way toward the implied TM each session.
const DAMPING = 0.6;
// Never move a TM by more than this fraction in a single session.
const MAX_DELTA_PCT = 0.05;
// Ignore changes smaller than this fraction (noise).
const MIN_DELTA_PCT = 0.01;
// The top set (setNumber 1) is weighted more heavily than back-off sets.
const TOP_SET_WEIGHT = 2;
const BACKOFF_WEIGHT = 1;

export function computeSessionAdjustments(
  sets: AutoregSet[],
  currentTms: Record<string, TrainingMax>
): AdjustmentSuggestion[] {
  const usable = sets.filter(
    (s): s is AutoregSet & { lift: LiftId } =>
      s.lift != null &&
      s.prescribedRpe != null &&
      s.actualRpe != null &&
      s.prescribedPercent != null &&
      s.actualWeight != null &&
      s.actualReps != null
  );

  const byLift = new Map<LiftId, (AutoregSet & { lift: LiftId })[]>();
  for (const s of usable) {
    const list = byLift.get(s.lift) ?? [];
    list.push(s);
    byLift.set(s.lift, list);
  }

  const suggestions: AdjustmentSuggestion[] = [];

  for (const [lift, liftSets] of byLift) {
    const tm = currentTms[lift];
    if (!tm || !(tm.trainingMax > 0)) continue;
    const currentTm = tm.trainingMax;

    let weightSum = 0;
    let weightedImplied = 0;
    for (const s of liftSets) {
      const implied = impliedTm(
        s.actualWeight!,
        s.actualReps!,
        s.actualRpe!,
        s.prescribedRpe!,
        s.prescribedPercent!
      );
      const w = s.setNumber === 1 ? TOP_SET_WEIGHT : BACKOFF_WEIGHT;
      weightSum += w;
      weightedImplied += implied * w;
    }
    if (weightSum === 0) continue;
    const weightedAvg = weightedImplied / weightSum;

    // Damped move toward the implied TM, rounded to the nearest 0.5 kg.
    let suggested = round05(currentTm + DAMPING * (weightedAvg - currentTm));

    // Cap the per-session delta at ±5%, keeping the value on a 0.5 kg step.
    const maxDelta = currentTm * MAX_DELTA_PCT;
    while (Math.abs(suggested - currentTm) > maxDelta + 1e-9) {
      suggested += suggested > currentTm ? -0.5 : 0.5;
    }

    const delta = suggested - currentTm;
    if (Math.abs(delta) < currentTm * MIN_DELTA_PCT) continue;

    suggestions.push({
      lift,
      currentTm,
      suggestedTm: suggested,
      deltaKg: Math.round(delta * 10) / 10,
      deltaPct: Math.round((delta / currentTm) * 1000) / 10,
      setsUsed: liftSets.length,
    });
  }

  return suggestions;
}
