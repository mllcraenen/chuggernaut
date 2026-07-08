"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/base-path";

export default function SessionTimer({
  startedAt,
  week,
  day,
}: {
  startedAt: string;
  week: number;
  day: number;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Restart the session clock only — logged sets are untouched (the server
  // action rewrites started_at and nothing else).
  async function reset() {
    setResetting(true);
    try {
      const res = await fetch(apiUrl(`/api/workout/sessions/${week}/${day}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-timer" }),
      });
      if (res.ok) router.refresh();
    } finally {
      setResetting(false);
    }
  }

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  const display = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;

  return (
    <span className="flex items-center gap-2 pb-0.5">
      <span className="font-mono text-sm text-[#8e8e93] tabular-nums">{display}</span>
      <button
        type="button"
        onClick={reset}
        disabled={resetting}
        className="text-[10px] uppercase tracking-wide text-[#3d5080] hover:text-[#8e8e93] border border-[#2a3352] rounded-md px-2 py-1 transition-colors disabled:opacity-40"
      >
        Reset
      </button>
    </span>
  );
}
