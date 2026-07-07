"use client";

import { apiUrl } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Explicit session start: POSTs to the sessions route (stamping started_at),
// then navigates to the log. The session page itself never starts a session.
export default function StartSessionButton({ week, day }: { week: number; day: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/workout/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, day }),
      });
      if (!res.ok) throw new Error(`Could not start session (${res.status})`);
      router.push(`/workout/session/${week}/${day}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full min-h-[56px] rounded-xl bg-[#e84545] text-white font-semibold text-lg hover:bg-[#d33a3a] transition-colors disabled:opacity-60"
      >
        {loading ? "Starting…" : "Start Training →"}
      </button>
      {error && <p className="text-sm text-[#e84545]">{error}</p>}
    </div>
  );
}
