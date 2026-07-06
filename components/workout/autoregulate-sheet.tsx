"use client";

import { useState } from "react";
import type { LiftId } from "@/lib/workout";
import type { AdjustmentSuggestion } from "@/lib/autoregulation";

// Local label map — avoids importing the runtime LIFTS value from lib/workout
// (which would pull node:sqlite into the client bundle).
const LIFT_LABELS: Record<LiftId, string> = {
  squat: "Squat",
  bench: "Bench Press",
  deadlift: "Deadlift",
};

type Props = {
  suggestions: AdjustmentSuggestion[];
  onApply: (accepted: LiftId[]) => void;
};

export default function AutoregulateSheet({ suggestions, onApply }: Props) {
  const [decisions, setDecisions] = useState<Record<string, "apply" | "skip">>({});

  function accepted(decided: Record<string, "apply" | "skip">): LiftId[] {
    return suggestions
      .filter((s) => decided[s.lift] === "apply")
      .map((s) => s.lift);
  }

  function decide(lift: LiftId, choice: "apply" | "skip") {
    const next = { ...decisions, [lift]: choice };
    setDecisions(next);
    // Once every lift has a decision, finalise with the accepted set.
    if (suggestions.every((s) => next[s.lift])) {
      onApply(accepted(next));
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md bg-[#141b2d] border-t border-[#2a3352] rounded-t-2xl px-4 pt-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto">
        <div>
          <h2 className="text-lg font-semibold text-[#f5f5f5]">
            Session complete — TM suggestions
          </h2>
          <p className="mt-1 text-sm text-[#8e8e93]">
            Based on your RPE feedback. Accept or skip each lift.
          </p>
        </div>

        <div className="space-y-3">
          {suggestions.map((s) => {
            const decision = decisions[s.lift];
            const positive = s.deltaKg >= 0;
            return (
              <div
                key={s.lift}
                className={`rounded-xl border bg-[#1e2740] p-4 space-y-3 transition-opacity ${
                  decision === "skip"
                    ? "border-[#2a3352] opacity-50"
                    : "border-[#2a3352]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-[#f5f5f5]">
                    {LIFT_LABELS[s.lift]}
                  </span>
                  <span className="text-xs text-[#8e8e93]">{s.setsUsed} sets</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[#8e8e93]">{s.currentTm} kg</span>
                  <span className="text-[#8e8e93]">→</span>
                  <span className="font-semibold text-[#f5f5f5]">{s.suggestedTm} kg</span>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      positive ? "text-[#30d158]" : "text-[#e8a23a]"
                    }`}
                  >
                    {positive ? "+" : ""}
                    {s.deltaPct}%
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide(s.lift, "apply")}
                    disabled={!!decision}
                    className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                      decision === "apply"
                        ? "bg-[#30d158] text-[#0c1322]"
                        : "bg-[#e84545] text-white hover:bg-[#d33a3a]"
                    }`}
                  >
                    {decision === "apply" ? "✓ Applied" : "Apply"}
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(s.lift, "skip")}
                    disabled={!!decision}
                    className="flex-1 min-h-[44px] rounded-lg border border-[#2a3352] bg-[#242f4a] text-sm font-medium text-[#8e8e93] hover:text-[#f5f5f5] transition-colors disabled:opacity-60"
                  >
                    {decision === "skip" ? "Skipped" : "Skip"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onApply(suggestions.map((s) => s.lift))}
            className="flex-1 min-h-[48px] rounded-xl bg-[#e84545] text-white font-semibold hover:bg-[#d33a3a] transition-colors"
          >
            Apply all
          </button>
          <button
            type="button"
            onClick={() => onApply([])}
            className="flex-1 min-h-[48px] rounded-xl border border-[#2a3352] bg-[#1e2740] text-[#8e8e93] font-medium hover:text-[#f5f5f5] transition-colors"
          >
            Skip all
          </button>
        </div>
      </div>
    </div>
  );
}
