"use client";

import { apiUrl } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TM_FACTOR_KEY = "tm_factor";

// Stored as a fraction (e.g. "0.88") in workout_settings; edited as a
// percentage. Server side falls back to the program default outside [50, 100].
export default function TmFactorInput({ initial }: { initial: number }) {
  const router = useRouter();
  const [pct, setPct] = useState<string>(String(Math.round(initial * 1000) / 10));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(pct);
  const valid = Number.isFinite(n) && n >= 50 && n <= 100;
  const dirty = valid && Math.abs(n / 100 - initial) > 0.0001;

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(apiUrl("/api/workout/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: TM_FACTOR_KEY, value: String(n / 100) }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setSaved(true);
      // Re-render server components so the TM auto-compute text and
      // suggestions pick up the new factor.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-[#f5f5f5]">Training max factor</p>
        {saving && <span className="text-xs text-[#8e8e93]">Saving…</span>}
        {saved && !saving && <span className="text-xs text-[#30d158]">Saved</span>}
      </div>
      <p className="text-xs text-[#8e8e93] mb-3">
        TM is auto-calculated as this percentage of e1RM.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={50}
          max={100}
          step={0.5}
          value={pct}
          onChange={(ev) => { setPct(ev.target.value); setSaved(false); }}
          className="w-24 rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2 text-[#f5f5f5] text-base outline-none focus:border-[#e84545]"
        />
        <span className="text-sm text-[#8e8e93]">%</span>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="ml-auto min-h-[44px] px-4 rounded-lg bg-[#242f4a] border border-[#2a3352] text-sm text-[#f5f5f5] disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#e84545] transition-colors"
        >
          Save
        </button>
      </div>
      {!valid && pct !== "" && (
        <p className="mt-2 text-xs text-[#e84545]">Must be between 50 and 100.</p>
      )}
      {error && <p className="mt-2 text-xs text-[#e84545]">{error}</p>}
    </div>
  );
}
