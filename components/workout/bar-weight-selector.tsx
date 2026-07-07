"use client";

import { apiUrl } from "@/lib/base-path";
import { useEffect, useState } from "react";

const BAR_WEIGHT_KEY = "bar_weight";
const OPTIONS = [20, 15] as const;

export default function BarWeightSelector({ initial }: { initial: number }) {
  const [selected, setSelected] = useState<number>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(initial);
  }, [initial]);

  async function pick(kg: number) {
    if (kg === selected) return;
    setSelected(kg);
    setSaved(false);
    setSaving(true);
    try {
      await fetch(apiUrl("/api/workout/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: BAR_WEIGHT_KEY, value: String(kg) }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-[#f5f5f5]">Bar weight</p>
        {saving && <span className="text-xs text-[#8e8e93]">Saving…</span>}
        {saved && !saving && <span className="text-xs text-[#30d158]">Saved</span>}
      </div>
      <div className="flex gap-2">
        {OPTIONS.map((kg) => (
          <button
            key={kg}
            type="button"
            onClick={() => pick(kg)}
            className={`min-h-[44px] flex-1 rounded-lg text-sm font-medium border transition-colors ${
              selected === kg
                ? "border-[#e84545] bg-[#e84545]/15 text-[#f5f5f5]"
                : "border-[#2a3352] bg-[#242f4a] text-[#8e8e93] hover:text-[#f5f5f5]"
            }`}
          >
            {kg} kg
          </button>
        ))}
      </div>
    </div>
  );
}
