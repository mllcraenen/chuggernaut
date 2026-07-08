// DB-aware autoregulation glue (Phase 4). The engine itself
// (lib/autoregulation.ts) stays pure; this module builds its inputs from a
// logged session, applies accepted suggestions server-side (never trusting
// client-supplied numbers), and records provenance events for every outcome.

import {
  computeSessionAdjustments,
  DAMPING,
  type AdjustmentSuggestion,
  type AutoregSet,
} from "./autoregulation";
import { getProgramDay } from "./workout-program";
import {
  getLatestBodyWeightKg,
  getSession,
  getSetsForSession,
  getSwapsForSession,
  getTmFactor,
  getTrainingMaxes,
  hasTmEvent,
  isTmAutoApplyEnabled,
  recordTmEvent,
  setTrainingMaxes,
  type LiftId,
} from "./workout";
import { getExercise } from "./exercise-registry";

// Build engine inputs for a session and compute TM suggestions. Bodyweight-
// aware: for bodyweight/assisted exercises the engine sees the effective load
// (body weight at the session date + external weight); sets without a logged
// body weight are dropped rather than fed garbage.
export function computeAdjustmentsForSession(
  week: number,
  day: number
): AdjustmentSuggestion[] {
  const programDay = getProgramDay(week, day);
  if (!programDay) return [];

  // Map each prescribed set (under its effective, possibly-swapped name) to
  // the lift and %TM it was programmed at, so logged rows can be enriched.
  const swapMap = getSwapsForSession(week, day);
  const prescribedByKey = new Map<
    string,
    { lift: LiftId | null; percentOfTM: number | null }
  >();
  for (const ex of programDay.exercises) {
    const effectiveName = swapMap[ex.name] ?? ex.name;
    for (const set of ex.sets) {
      prescribedByKey.set(`${effectiveName}#${set.setNumber}`, {
        lift: ex.lift,
        percentOfTM: set.percentOfTM,
      });
    }
  }

  const sessionDate = getSession(week, day)?.startedAt?.slice(0, 10);

  const inputs: AutoregSet[] = [];
  for (const s of getSetsForSession(week, day)) {
    if (!s.loggedAt) continue;
    const prescribed = prescribedByKey.get(`${s.exercise}#${s.setNumber}`);

    let actualWeight = s.actualWeight;
    const def = getExercise(s.exercise);
    if (
      actualWeight != null &&
      (def?.loadMode === "bodyweight" || def?.loadMode === "assisted")
    ) {
      const bw = getLatestBodyWeightKg(sessionDate);
      if (bw == null) continue; // effective load unknown — skip the set
      actualWeight = bw + actualWeight;
    }

    inputs.push({
      lift: prescribed?.lift ?? null,
      setNumber: s.setNumber,
      prescribedPercent: prescribed?.percentOfTM ?? null,
      prescribedRpe: s.prescribedRpe,
      actualWeight,
      actualReps: s.actualReps,
      actualRpe: s.actualRpe,
    });
  }

  return computeSessionAdjustments(inputs, getTrainingMaxes());
}

// e1RM implied by a TM under the current factor (inverse of TM = e1RM × factor).
function tmToE1rm(tm: number, factor: number): number {
  return Math.round((tm / factor) * 10) / 10;
}

// Record "suggested but not (yet) applied" events, once per (lift, week, day).
// If the lift already has an auto event for this session the suggestion was
// applied — nothing to record.
export function recordSuggestionEvents(
  week: number,
  day: number,
  suggestions: AdjustmentSuggestion[]
): void {
  const factor = getTmFactor();
  for (const s of suggestions) {
    if (hasTmEvent(s.lift, week, day, "suggestion")) continue;
    if (hasTmEvent(s.lift, week, day, "auto")) continue;
    recordTmEvent(
      {
        lift: s.lift,
        e1rm: tmToE1rm(s.suggestedTm, factor),
        trainingMax: s.suggestedTm,
      },
      {
        source: "suggestion",
        applied: false,
        sourceWeek: week,
        sourceDay: day,
        setsUsed: s.setsUsed,
        impliedTm: s.impliedTm,
        damping: DAMPING,
      }
    );
  }
}

// Apply the given lifts' suggestions for a session. Recomputes server-side,
// ignores lifts without a current suggestion, and is idempotent per
// (lift, week, day) — a second call (double-tap, retried request, auto-apply
// racing a manual confirm) is a no-op. Returns what was actually applied.
export function applySessionAdjustments(
  week: number,
  day: number,
  lifts: LiftId[],
  // Precomputed suggestions for this session, if the caller already has them
  // (avoids running the whole pipeline twice on the auto-apply path).
  suggestions: AdjustmentSuggestion[] = computeAdjustmentsForSession(week, day)
): AdjustmentSuggestion[] {
  const wanted = new Set(lifts);
  const factor = getTmFactor();
  const applied: AdjustmentSuggestion[] = [];
  for (const s of suggestions) {
    if (!wanted.has(s.lift)) continue;
    if (hasTmEvent(s.lift, week, day, "auto")) continue;
    setTrainingMaxes(
      [
        {
          lift: s.lift,
          e1rm: tmToE1rm(s.suggestedTm, factor),
          trainingMax: s.suggestedTm,
        },
      ],
      {
        source: "auto",
        sourceWeek: week,
        sourceDay: day,
        setsUsed: s.setsUsed,
        impliedTm: s.impliedTm,
        damping: DAMPING,
      }
    );
    applied.push(s);
  }
  return applied;
}

// Auto-apply path (tm_auto_apply setting on): apply every suggestion for the
// session. Returns the applied list, or null when the toggle is off (caller
// falls back to suggest-then-confirm).
export function maybeAutoApply(week: number, day: number): AdjustmentSuggestion[] | null {
  if (!isTmAutoApplyEnabled()) return null;
  const suggestions = computeAdjustmentsForSession(week, day);
  return applySessionAdjustments(
    week,
    day,
    suggestions.map((s) => s.lift),
    suggestions
  );
}
