"use client";

import { apiUrl } from "@/lib/base-path";
import { useState } from "react";

export default function GoalDateForm({ current }: { current: string | null }) {
  const [date, setDate] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      if (!date) {
        await fetch(apiUrl("/api/workout/goal-date"), { method: "DELETE" });
      } else {
        await fetch(apiUrl("/api/workout/goal-date"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalDate: date }),
        });
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4 space-y-3">
      <p className="text-sm font-medium text-[#f5f5f5]">Goal / meet date</p>
      <p className="text-xs text-[#8e8e93]">Shows a countdown on the overview screen.</p>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setSaved(false); }}
          className="flex-1 rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2.5 text-[#f5f5f5] text-sm outline-none focus:border-[#e84545] [color-scheme:dark]"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-[44px] px-5 rounded-xl bg-[#e84545] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#d33a3a] transition-colors"
        >
          {saving ? "…" : saved ? "✓" : "Save"}
        </button>
      </div>
      {date && (
        <button
          type="button"
          onClick={() => { setDate(""); setSaved(false); }}
          className="text-xs text-[#3d5080] hover:text-[#8e8e93] transition-colors"
        >
          Clear date
        </button>
      )}
    </div>
  );
}
