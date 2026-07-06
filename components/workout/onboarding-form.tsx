"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TM_FACTOR } from "@/lib/workout-program";

const LIFTS: { id: string; label: string }[] = [
  { id: "squat", label: "Squat" },
  { id: "bench", label: "Bench Press" },
  { id: "deadlift", label: "Deadlift (Sumo)" },
];

type Entry = { e1rm: string; tm: string; tmTouched: boolean };

function suggestTm(e1rm: string): string {
  const n = Number(e1rm);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * TM_FACTOR * 10) / 10);
}

export default function OnboardingForm() {
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(LIFTS.map((l) => [l.id, { e1rm: "", tm: "", tmTouched: false }]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setE1rm(id: string, value: string) {
    setEntries((prev) => {
      const cur = prev[id];
      return {
        ...prev,
        [id]: {
          ...cur,
          e1rm: value,
          // Keep TM in sync with the 90% suggestion until the user edits it.
          tm: cur.tmTouched ? cur.tm : suggestTm(value),
        },
      };
    });
  }

  function setTm(id: string, value: string) {
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], tm: value, tmTouched: true } }));
  }

  const ready = LIFTS.every((l) => {
    const e = entries[l.id];
    return Number(e.e1rm) > 0 && Number(e.tm) > 0;
  });

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const maxes = LIFTS.map((l) => ({
        lift: l.id,
        e1rm: Number(entries[l.id].e1rm),
        trainingMax: Number(entries[l.id].tm),
      }));
      const res = await fetch("/api/workout/training-maxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-[#f5f5f5]">Set your training maxes</h1>
        <p className="text-sm text-[#8e8e93]">
          Enter your estimated 1-rep max for each lift. Training max defaults to 90%
          (Calgary Barbell). Adjust if you want.
        </p>
      </div>

      <div className="space-y-3">
        {LIFTS.map((l) => {
          const e = entries[l.id];
          return (
            <div
              key={l.id}
              className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4 space-y-3"
            >
              <p className="text-sm font-medium text-[#f5f5f5]">{l.label}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-[#8e8e93]">e1RM (kg)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={2.5}
                    value={e.e1rm}
                    onChange={(ev) => setE1rm(l.id, ev.target.value)}
                    className="mt-1 w-full rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2 text-[#f5f5f5] text-base outline-none focus:border-[#e84545]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[#8e8e93]">Training max (kg)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={2.5}
                    value={e.tm}
                    onChange={(ev) => setTm(l.id, ev.target.value)}
                    className="mt-1 w-full rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2 text-[#f5f5f5] text-base outline-none focus:border-[#e84545]"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-[#e84545]">{error}</p>}

      <button
        type="button"
        disabled={!ready || submitting}
        onClick={submit}
        className="w-full min-h-[44px] rounded-xl bg-[#e84545] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d33a3a] transition-colors"
      >
        {submitting ? "Saving…" : "Save & start program"}
      </button>
    </div>
  );
}
