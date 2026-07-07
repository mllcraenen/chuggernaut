"use client";

import { apiUrl } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { LiftId } from "@/lib/workout";
import type {
  ExerciseRole,
  LoadMode,
  RepMode,
  E1rmMode,
} from "@/lib/exercise-registry";

export type ExerciseView = {
  id: number;
  name: string;
  lift: LiftId | null;
  role: ExerciseRole;
  loadMode: LoadMode;
  repMode: RepMode;
  e1rmMode: E1rmMode;
  archived: boolean;
  alternativeIds: number[];
  referenced: boolean;
};

type Props = {
  initialExercises: ExerciseView[];
  lifts: { id: LiftId; label: string }[];
};

type Draft = {
  id: number | null; // null = creating
  name: string;
  lift: LiftId | "";
  role: ExerciseRole;
  loadMode: LoadMode;
  repMode: RepMode;
  e1rmMode: E1rmMode;
  alternativeIds: number[];
  referenced: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  lift: "",
  role: "accessory",
  loadMode: "external",
  repMode: "reps",
  e1rmMode: "epley",
  alternativeIds: [],
  referenced: false,
};

const LOAD_MODE_LABELS: Record<LoadMode, string> = {
  external: "External weight",
  bodyweight: "Bodyweight (+ extra)",
  assisted: "Assisted (negative allowed)",
};

const REP_MODE_LABELS: Record<RepMode, string> = {
  reps: "Reps",
  time: "Time (seconds)",
};

const E1RM_MODE_LABELS: Record<E1rmMode, string> = {
  epley: "Epley on weight",
  bodyweight_epley: "Epley on BW + weight",
  none: "No e1RM",
};

const inputCls =
  "w-full rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2.5 text-[#f5f5f5] text-sm outline-none focus:border-[#e84545]";

function Section({
  title,
  items,
  onEdit,
}: {
  title: string;
  items: ExerciseView[];
  onEdit: (e: ExerciseView) => void;
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-[#8e8e93] uppercase tracking-widest mb-2">
        {title}
      </h2>
      <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] divide-y divide-[#2a3352]">
        {items.length === 0 && (
          <p className="px-4 py-3 text-sm text-[#8e8e93]">None</p>
        )}
        {items.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onEdit(e)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#242f4a] transition-colors"
          >
            <div className="min-w-0 pr-3">
              <p className={`text-sm font-medium truncate ${e.archived ? "text-[#8e8e93] line-through" : "text-[#f5f5f5]"}`}>
                {e.name}
              </p>
              <p className="text-[11px] text-[#8e8e93] mt-0.5">
                {e.lift ?? "no lift"}
                {e.loadMode !== "external" && ` · ${e.loadMode}`}
                {e.repMode === "time" && " · timed"}
              </p>
            </div>
            <span className="text-[#3d5080] text-lg flex-shrink-0">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ExerciseManager({ initialExercises, lifts }: Props) {
  const router = useRouter();
  const [exercises, setExercises] = useState<ExerciseView[]>(initialExercises);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = exercises.filter((e) => showArchived || !e.archived);
  const mains = visible.filter((e) => e.role === "main");
  const accessories = visible.filter((e) => e.role === "accessory");
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  function openEdit(e: ExerciseView) {
    setError(null);
    setDraft({
      id: e.id,
      name: e.name,
      lift: e.lift ?? "",
      role: e.role,
      loadMode: e.loadMode,
      repMode: e.repMode,
      e1rmMode: e.e1rmMode,
      alternativeIds: e.alternativeIds,
      referenced: e.referenced,
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: draft.name,
        lift: draft.lift === "" ? null : draft.lift,
        role: draft.role,
        loadMode: draft.loadMode,
        repMode: draft.repMode,
        e1rmMode: draft.e1rmMode,
        alternativeIds: draft.alternativeIds,
      };
      const res = await fetch(
        apiUrl(draft.id === null ? "/api/workout/exercises" : `/api/workout/exercises/${draft.id}`),
        {
          method: draft.id === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setExercises((prev) =>
        draft.id === null
          ? [...prev, data as ExerciseView]
          : prev.map((e) => (e.id === draft.id ? (data as ExerciseView) : e))
      );
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save exercise");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchived(e: ExerciseView) {
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/workout/exercises/${e.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !e.archived }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Update failed (${res.status})`);
      setExercises((prev) => prev.map((x) => (x.id === e.id ? (data as ExerciseView) : x)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update exercise");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-[#8e8e93]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-[#e84545]"
          />
          Show archived
        </label>
        <button
          type="button"
          onClick={() => { setError(null); setDraft({ ...EMPTY_DRAFT }); }}
          className="min-h-[36px] px-4 rounded-lg bg-[#e84545] text-white text-xs font-semibold hover:bg-[#d33a3a] transition-colors"
        >
          + New exercise
        </button>
      </div>

      {error && !draft && <p className="text-sm text-[#e84545]">{error}</p>}

      <Section title="Main lifts" items={mains} onEdit={openEdit} />
      <Section title="Accessories" items={accessories} onEdit={openEdit} />

      {/* Editor sheet */}
      {draft && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setDraft(null)}
          />
          <div className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-[#1e2740] border-t border-[#2a3352] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[#2a3352]" />
            </div>
            <div className="px-5 py-3 border-b border-[#2a3352]">
              <p className="text-xs font-semibold text-[#e84545] uppercase tracking-widest">
                {draft.id === null ? "New exercise" : "Edit exercise"}
              </p>
            </div>

            <div className="px-5 py-4 space-y-4 max-w-md mx-auto w-full">
              <label className="block">
                <span className="text-xs text-[#8e8e93]">Name</span>
                <input
                  type="text"
                  value={draft.name}
                  disabled={draft.referenced}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={`mt-1 ${inputCls} ${draft.referenced ? "opacity-60" : ""}`}
                />
                {draft.referenced && (
                  <span className="text-[11px] text-[#8e8e93]">
                    Rename locked — logged sets, swaps or notes reference this name. Archive it and create a new exercise instead.
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-[#8e8e93]">Role</span>
                  <select
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value as ExerciseRole })}
                    className={`mt-1 ${inputCls}`}
                  >
                    <option value="main">Main</option>
                    <option value="accessory">Accessory</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-[#8e8e93]">Lift family</span>
                  <select
                    value={draft.lift}
                    onChange={(e) => setDraft({ ...draft, lift: e.target.value as LiftId | "" })}
                    className={`mt-1 ${inputCls}`}
                  >
                    <option value="">— none —</option>
                    {lifts.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs text-[#8e8e93]">Load mode</span>
                <select
                  value={draft.loadMode}
                  onChange={(e) => setDraft({ ...draft, loadMode: e.target.value as LoadMode })}
                  className={`mt-1 ${inputCls}`}
                >
                  {(Object.keys(LOAD_MODE_LABELS) as LoadMode[]).map((m) => (
                    <option key={m} value={m}>{LOAD_MODE_LABELS[m]}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-[#8e8e93]">Rep mode</span>
                  <select
                    value={draft.repMode}
                    onChange={(e) => setDraft({ ...draft, repMode: e.target.value as RepMode })}
                    className={`mt-1 ${inputCls}`}
                  >
                    {(Object.keys(REP_MODE_LABELS) as RepMode[]).map((m) => (
                      <option key={m} value={m}>{REP_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-[#8e8e93]">e1RM mode</span>
                  <select
                    value={draft.e1rmMode}
                    onChange={(e) => setDraft({ ...draft, e1rmMode: e.target.value as E1rmMode })}
                    className={`mt-1 ${inputCls}`}
                  >
                    {(Object.keys(E1RM_MODE_LABELS) as E1rmMode[]).map((m) => (
                      <option key={m} value={m}>{E1RM_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <span className="text-xs text-[#8e8e93]">Allowed swaps</span>
                <div className="mt-1 rounded-lg border border-[#2a3352] bg-[#242f4a] max-h-44 overflow-y-auto divide-y divide-[#2a3352]">
                  {exercises
                    .filter((e) => e.id !== draft.id && !e.archived)
                    .map((e) => {
                      const checked = draft.alternativeIds.includes(e.id);
                      return (
                        <label key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDraft({
                                ...draft,
                                alternativeIds: checked
                                  ? draft.alternativeIds.filter((id) => id !== e.id)
                                  : [...draft.alternativeIds, e.id],
                              })
                            }
                            className="accent-[#e84545]"
                          />
                          <span className="text-[#f5f5f5]">{e.name}</span>
                        </label>
                      );
                    })}
                </div>
                {draft.alternativeIds.length > 0 && (
                  <p className="text-[11px] text-[#8e8e93] mt-1">
                    {draft.alternativeIds
                      .map((id) => byId.get(id)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>

              {error && <p className="text-sm text-[#e84545]">{error}</p>}

              <div className="flex gap-2 pb-8">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !draft.name.trim()}
                  className="flex-1 min-h-[48px] rounded-xl bg-[#e84545] text-white font-semibold text-sm disabled:opacity-40 hover:bg-[#d33a3a] transition-colors"
                >
                  {saving ? "Saving…" : draft.id === null ? "Create" : "Save"}
                </button>
                {draft.id !== null && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const e = byId.get(draft.id!);
                      if (e) { toggleArchived(e); setDraft(null); }
                    }}
                    className="min-h-[48px] px-4 rounded-xl border border-[#2a3352] text-[#8e8e93] text-sm font-medium hover:border-[#e84545] hover:text-[#e84545] transition-colors"
                  >
                    {byId.get(draft.id)?.archived ? "Unarchive" : "Archive"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                  className="min-h-[48px] px-4 rounded-xl border border-[#2a3352] text-[#8e8e93] text-sm font-medium hover:text-[#f5f5f5] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
