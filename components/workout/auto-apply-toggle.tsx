"use client";

import { apiUrl } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useState } from "react";

const AUTO_APPLY_KEY = "tm_auto_apply";

// D2 toggle: when on, TM suggestions are applied automatically on session
// completion (still fully recorded as provenance events); when off, the
// post-session confirm sheet asks per lift.
export default function AutoApplyToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/workout/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: AUTO_APPLY_KEY, value: next ? "1" : "0" }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setOn(!next); // revert on failure
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#f5f5f5]">Auto-apply TM suggestions</p>
          <p className="text-xs text-[#8e8e93] mt-0.5">
            {on
              ? "Suggestions apply automatically when you finish a session."
              : "You confirm each suggestion after finishing a session."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={saving}
          onClick={toggle}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
            on ? "bg-[#30d158]" : "bg-[#242f4a] border border-[#2a3352]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
              on ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[#e84545]">{error}</p>}
    </div>
  );
}
