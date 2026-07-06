"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LiftId, TrainingMax, TmHistoryEntry } from "@/lib/workout";
import { TM_FACTOR } from "@/lib/workout-program";

function suggestTm(e1rm: string): string {
  const n = Number(e1rm);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * TM_FACTOR * 10) / 10);
}

type Entry = { e1rm: string; tm: string; tmTouched: boolean };

function TmHistory({ entries }: { entries: TmHistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  // Newest first, last 5.
  const recent = [...entries].reverse().slice(0, 5);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-[#8e8e93] hover:text-[#f5f5f5] transition-colors min-h-[32px] flex items-center gap-1"
      >
        History {open ? "▾" : "▸"}
      </button>
      {open && (
        <ul className="mt-1 space-y-1">
          {recent.map((e, i) => (
            <li key={`${e.setAt}-${i}`} className="flex items-center justify-between text-xs">
              <span className="text-[#8e8e93]">
                {new Date(e.setAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[#f5f5f5] font-mono">{e.trainingMax} kg</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    e.reason === "Auto"
                      ? "bg-[#30d158]/15 text-[#30d158]"
                      : "bg-[#2a3352] text-[#8e8e93]"
                  }`}
                >
                  {e.reason}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsForm({
  lifts,
  currentTms,
  history = {},
}: {
  lifts: { id: LiftId; label: string }[];
  currentTms: Record<string, TrainingMax>;
  history?: Record<string, TmHistoryEntry[]>;
}) {
  const router = useRouter();

  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      lifts.map((l) => {
        const existing = currentTms[l.id];
        return [
          l.id,
          {
            e1rm: existing ? String(existing.e1rm) : "",
            tm: existing ? String(existing.trainingMax) : "",
            // Only an explicit TM-field edit pins the TM; editing e1RM
            // otherwise recomputes it (tmTouched set in setTm).
            tmTouched: false,
          },
        ];
      })
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setE1rm(id: string, value: string) {
    setEntries((prev) => {
      const cur = prev[id];
      return {
        ...prev,
        [id]: {
          ...cur,
          e1rm: value,
          tm: cur.tmTouched ? cur.tm : suggestTm(value),
        },
      };
    });
    setSaved(false);
  }

  function setTm(id: string, value: string) {
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], tm: value, tmTouched: true } }));
    setSaved(false);
  }

  const ready = lifts.every((l) => {
    const e = entries[l.id];
    return Number(e.e1rm) > 0 && Number(e.tm) > 0;
  });

  async function submit() {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const maxes = lifts.map((l) => ({
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
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {lifts.map((l) => {
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
            <TmHistory entries={history[l.id] ?? []} />
          </div>
        );
      })}

      {error && <p className="text-sm text-[#e84545]">{error}</p>}
      {saved && <p className="text-sm text-[#30d158]">Saved.</p>}

      <button
        type="button"
        disabled={!ready || submitting}
        onClick={submit}
        className="w-full min-h-[44px] rounded-xl bg-[#e84545] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#d33a3a] transition-colors"
      >
        {submitting ? "Saving…" : "Save training maxes"}
      </button>
    </div>
  );
}
