"use client";

import { apiUrl } from "@/lib/base-path";
import { useMemo, useState } from "react";
import { UnitProvider, useUnit } from "@/components/workout/unit-context";
import { kgToDisplay, displayToKg, unitLabel } from "@/lib/units";
import type { BodyWeightPoint } from "@/lib/workout";
import BodyWeightChart from "@/components/workout/body-weight-chart";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const now = new Date(todayISO() + "T00:00:00");
  const diff = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff} days ago`;
}

function BodyWeightInner({ initial }: { initial: BodyWeightPoint[] }) {
  const { unit } = useUnit();
  const [history, setHistory] = useState<BodyWeightPoint[]>(initial);
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...history].sort((a, b) => a.date.localeCompare(b.date)),
    [history]
  );
  const last = sorted[sorted.length - 1] ?? null;

  const chartPoints = useMemo(
    () =>
      sorted.map((p) => ({
        date: p.date,
        value:
          unit === "lbs"
            ? Math.round(p.weightKg * 2.20462 * 10) / 10
            : p.weightKg,
      })),
    [sorted, unit]
  );

  async function log() {
    setError(null);
    const val = Number(weight);
    if (!Number.isFinite(val) || val <= 0) {
      setError("Enter a valid weight");
      return;
    }
    const weightKg = displayToKg(val, unit);
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/workout/body-weight"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, weightKg }),
      });
      if (!res.ok) {
        setError("Failed to save");
        return;
      }
      setHistory((prev) => {
        const others = prev.filter((p) => p.date !== date);
        return [...others, { date, weightKg }];
      });
      setWeight("");
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-widest px-1">
        Body weight
      </p>
      <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4 space-y-3">
        {last ? (
          <p className="text-sm text-[#f5f5f5]">
            Last:{" "}
            <span className="font-mono text-[#e84545]">
              {kgToDisplay(last.weightKg, unit)}
            </span>{" "}
            <span className="text-[#8e8e93]">({daysAgo(last.date)})</span>
          </p>
        ) : (
          <p className="text-sm text-[#8e8e93]">No entries yet.</p>
        )}

        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 min-h-[44px] rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2.5 text-[#f5f5f5] text-sm outline-none focus:border-[#e84545] [color-scheme:dark]"
          />
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            placeholder={`Weight (${unitLabel(unit)})`}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-28 min-h-[44px] rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2.5 text-[#f5f5f5] text-sm outline-none focus:border-[#e84545]"
          />
          <button
            type="button"
            onClick={log}
            disabled={saving}
            className="min-h-[44px] px-5 rounded-xl bg-[#e84545] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#d33a3a] transition-colors"
          >
            {saving ? "…" : "Log"}
          </button>
        </div>
        {error && <p className="text-xs text-[#e84545]">{error}</p>}

        {chartPoints.length >= 2 && (
          <div className="pt-1">
            <BodyWeightChart points={chartPoints} />
          </div>
        )}
      </div>
    </section>
  );
}

export default function BodyWeightSection({ initial }: { initial: BodyWeightPoint[] }) {
  return (
    <UnitProvider>
      <BodyWeightInner initial={initial} />
    </UnitProvider>
  );
}
