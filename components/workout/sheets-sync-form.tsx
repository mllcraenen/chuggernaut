"use client";

import { useState } from "react";

type SyncState = "idle" | "syncing" | "error";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function SheetsSyncForm({
  configured,
  lastSync,
  spreadsheetId,
}: {
  configured: boolean;
  lastSync: string | null;
  spreadsheetId: string;
}) {
  const [creds, setCreds] = useState("");
  const [sheetId, setSheetId] = useState(spreadsheetId);
  const [isConfigured, setIsConfigured] = useState(configured);
  const [syncedAt, setSyncedAt] = useState<string | null>(lastSync);
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function saveConfig() {
    setState("syncing");
    setMessage(null);
    try {
      const res = await fetch("/api/workout/sheets/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: creds, spreadsheetId: sheetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      setIsConfigured(Boolean(data?.configured));
      setCreds(""); // never keep the secret in component state after saving
      setState("idle");
      setMessage("Saved");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Could not save config");
    }
  }

  async function runSync(direction: "export" | "import") {
    setState("syncing");
    setMessage(null);
    try {
      const res = await fetch(`/api/workout/sheets/${direction}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      if (data?.lastSync) setSyncedAt(data.lastSync);
      setState("idle");
      setMessage(direction === "export" ? "Exported to sheet" : "Imported from sheet");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Sync failed");
    }
  }

  const busy = state === "syncing";
  const inputCls =
    "w-full rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2.5 text-[#f5f5f5] text-sm outline-none focus:border-[#e84545]";

  return (
    <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#f5f5f5]">Google Sheets sync</p>
        <span
          className={`text-xs ${
            state === "error"
              ? "text-[#e84545]"
              : state === "syncing"
                ? "text-[#8e8e93]"
                : isConfigured
                  ? "text-[#30d158]"
                  : "text-[#8e8e93]"
          }`}
        >
          {state === "syncing" ? "syncing…" : state === "error" ? "error" : isConfigured ? "configured" : "not configured"}
        </span>
      </div>
      <p className="text-xs text-[#8e8e93]">
        Paste a Google service-account JSON and the sheet ID. Give the service-account email Editor
        access to the sheet in Google Drive.
      </p>

      <textarea
        value={creds}
        onChange={(e) => setCreds(e.target.value)}
        placeholder={isConfigured ? "Service account JSON (saved — paste to replace)" : "Service account JSON"}
        rows={3}
        className={`${inputCls} font-mono [color-scheme:dark] resize-y`}
      />
      <input
        type="text"
        value={sheetId}
        onChange={(e) => setSheetId(e.target.value)}
        placeholder="Spreadsheet ID"
        className={inputCls}
      />

      <button
        type="button"
        onClick={saveConfig}
        disabled={busy || !sheetId.trim() || !creds.trim()}
        className="min-h-[44px] w-full rounded-xl bg-[#e84545] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#d33a3a] transition-colors"
      >
        Save
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => runSync("export")}
          disabled={busy || !isConfigured}
          className="min-h-[44px] flex-1 rounded-xl border border-[#2a3352] bg-[#242f4a] text-[#f5f5f5] text-sm font-medium disabled:opacity-40 hover:border-[#e84545] transition-colors"
        >
          Export to Sheet
        </button>
        <button
          type="button"
          onClick={() => runSync("import")}
          disabled={busy || !isConfigured}
          className="min-h-[44px] flex-1 rounded-xl border border-[#2a3352] bg-[#242f4a] text-[#f5f5f5] text-sm font-medium disabled:opacity-40 hover:border-[#e84545] transition-colors"
        >
          Import from Sheet
        </button>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-[#8e8e93]">
          {syncedAt ? `Last sync: ${timeAgo(syncedAt)}` : "Never synced"}
        </span>
        {message && (
          <span className={state === "error" ? "text-[#e84545]" : "text-[#30d158]"}>{message}</span>
        )}
      </div>
    </div>
  );
}
