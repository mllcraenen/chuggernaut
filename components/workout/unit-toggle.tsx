"use client";

import { useEffect, useState } from "react";
import type { Unit } from "@/lib/units";
import { UNITS_KEY } from "@/lib/units";

export default function UnitToggle() {
  const [unit, setUnitState] = useState<Unit>("kg");

  useEffect(() => {
    const saved = localStorage.getItem(UNITS_KEY);
    if (saved === "lbs" || saved === "kg") setUnitState(saved);
  }, []);

  function toggle(u: Unit) {
    setUnitState(u);
    localStorage.setItem(UNITS_KEY, u);
  }

  return (
    <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4 space-y-3">
      <p className="text-sm font-medium text-[#f5f5f5]">Weight units</p>
      <div className="flex gap-2">
        {(["kg", "lbs"] as Unit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => toggle(u)}
            className={`flex-1 min-h-[44px] rounded-xl border text-sm font-semibold transition-colors ${
              unit === u
                ? "border-[#e84545] bg-[#e84545]/15 text-[#f5f5f5]"
                : "border-[#2a3352] bg-[#242f4a] text-[#8e8e93] hover:text-[#f5f5f5]"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
      <p className="text-xs text-[#3d5080]">Affects all weight displays. Data is always stored in kg.</p>
    </div>
  );
}
