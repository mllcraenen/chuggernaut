"use client";

import { useState } from "react";
import type { WarmupDrill } from "@/lib/warmup-routines";

type Props = {
  drills: WarmupDrill[];
};

// Collapsible pre-session warmup checklist. Checked state is ephemeral (visual
// only) — warmups are not logged to the DB.
export default function WarmupChecklist({ drills }: Props) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  if (drills.length === 0) return null;

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold text-[#8e8e93] uppercase tracking-widest">
          Warm-up · {drills.length} drills
        </span>
        <span
          className={`text-[#8e8e93] text-lg leading-none transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-[#2a3352] border-t border-[#2a3352]">
          {drills.map((drill, i) => {
            const isChecked = checked.has(i);
            return (
              <li key={drill.name}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={isChecked}
                  className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isChecked ? "bg-[#242f4a]" : ""
                  }`}
                >
                  <span
                    className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                      isChecked
                        ? "border-[#30d158] bg-[#30d158]"
                        : "border-[#3d5080] bg-transparent"
                    }`}
                  >
                    {isChecked && <span className="text-[#141b2d] text-xs font-bold">✓</span>}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className={`block text-sm font-medium ${
                        isChecked ? "text-[#8e8e93] line-through" : "text-[#f5f5f5]"
                      }`}
                    >
                      {drill.name}
                    </span>
                    {drill.note && (
                      <span className="block text-xs text-[#8e8e93] mt-0.5">{drill.note}</span>
                    )}
                  </span>
                  <span className="text-xs text-[#8e8e93] flex-shrink-0">{drill.reps}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
