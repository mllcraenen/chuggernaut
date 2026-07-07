"use client";

import { apiUrl } from "@/lib/base-path";
import { useEffect, useState } from "react";

type SwapScope = "day" | "block";

type Props = {
  exercise: string;
  week: number;
  day: number;
  isSwapped: boolean;
  onSwapped: (replacement: string | null) => void;
};

export default function SwapSheet({ exercise, week, day, isSwapped, onSwapped }: Props) {
  const [open, setOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(apiUrl(`/api/workout/swaps?exercise=${encodeURIComponent(exercise)}`))
      .then((r) => r.json())
      .then((d) => setAlternatives(d.alternatives ?? []))
      .catch(() => setAlternatives([]));
  }, [open, exercise]);

  async function confirmSwap(scope: SwapScope) {
    if (!selected) return;
    setLoading(true);
    try {
      await fetch(apiUrl("/api/workout/swaps"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalExercise: exercise, replacementExercise: selected, scope, week, day }),
      });
      onSwapped(selected);
      setOpen(false);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function clearSwap() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ originalExercise: exercise, week: String(week), day: String(day) });
      await fetch(apiUrl(`/api/workout/swaps?${params}`), { method: "DELETE" });
      onSwapped(null);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ⇄ trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-base select-none transition-colors ${
          isSwapped ? "text-[#e84545]" : "text-[#3d5080] hover:text-[#8e8e93]"
        }`}
        aria-label="Swap exercise"
      >
        ⇄
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => { setOpen(false); setSelected(null); }}
        />
      )}

      {/* Bottom sheet */}
      {open && (
        <div className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-[#1e2740] border-t border-[#2a3352] max-h-[80vh] flex flex-col">
          {/* Sheet handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-[#2a3352]" />
          </div>

          {/* Header */}
          <div className="px-5 py-3 border-b border-[#2a3352]">
            <p className="text-xs font-semibold text-[#e84545] uppercase tracking-widest">Swap exercise</p>
            <p className="text-base font-bold text-[#f5f5f5] mt-0.5">{exercise}</p>
          </div>

          {/* Current swap indicator */}
          {isSwapped && (
            <div className="px-5 py-3 border-b border-[#2a3352] flex items-center justify-between">
              <p className="text-xs text-[#8e8e93]">Currently swapped</p>
              <button
                type="button"
                onClick={clearSwap}
                disabled={loading}
                className="text-xs text-[#e84545] font-medium"
              >
                Clear swap
              </button>
            </div>
          )}

          {/* Alternatives list */}
          <div className="overflow-y-auto flex-1">
            {alternatives.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#8e8e93]">No alternatives defined for this exercise.</p>
            ) : (
              <>
                <p className="px-5 pt-3 pb-1 text-xs font-semibold text-[#8e8e93] uppercase tracking-widest">Recommended</p>
                <div className="divide-y divide-[#2a3352]">
                  {alternatives.map((alt) => (
                    <div key={alt} className={`flex items-center justify-between px-5 py-3.5 transition-colors ${selected === alt ? "bg-[#242f4a]" : ""}`}>
                      <span className="text-sm text-[#f5f5f5] font-medium">{alt}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#3d5080]">ⓘ</span>
                        <button
                          type="button"
                          onClick={() => setSelected(selected === alt ? null : alt)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            selected === alt
                              ? "border-[#e84545] bg-[#e84545]"
                              : "border-[#3d5080] bg-transparent"
                          }`}
                        >
                          {selected === alt && <span className="text-white text-xs font-bold">✓</span>}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Confirm action — only shown once something is selected */}
          {selected && (
            <div className="border-t border-[#2a3352] bg-[#141b2d] px-5 py-4 space-y-2">
              <p className="text-xs text-center text-[#8e8e93]">
                Swap <span className="text-[#f5f5f5] font-medium">{exercise}</span> → <span className="text-[#e84545] font-medium">{selected}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => confirmSwap("day")}
                  className="flex-1 min-h-[48px] rounded-xl bg-[#e84545] text-white font-semibold text-sm disabled:opacity-40 hover:bg-[#d33a3a] transition-colors"
                >
                  Just today
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => confirmSwap("block")}
                  className="flex-1 min-h-[48px] rounded-xl border border-[#2a3352] bg-[#1e2740] text-[#f5f5f5] font-semibold text-sm disabled:opacity-40 hover:bg-[#242f4a] transition-colors"
                >
                  Rest of block
                </button>
              </div>
            </div>
          )}

          {/* Cancel */}
          <div className="px-5 pb-8 pt-2 bg-[#141b2d]">
            <button
              type="button"
              onClick={() => { setOpen(false); setSelected(null); }}
              className="w-full min-h-[44px] rounded-xl border border-[#2a3352] text-[#8e8e93] text-sm font-medium hover:text-[#f5f5f5] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
