"use client";

import { apiUrl } from "@/lib/base-path";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiftId } from "@/lib/workout";
import SwapSheet from "@/components/workout/swap-sheet";
import { UnitProvider, useUnit } from "@/components/workout/unit-context";
import { kgToDisplay, displayToKg, unitLabel, KG_TO_LBS } from "@/lib/units";
import type { Unit } from "@/lib/units";
import { calculatePlates } from "@/lib/plate-calculator";
import AutoregulateSheet from "@/components/workout/autoregulate-sheet";
import type { AdjustmentSuggestion } from "@/lib/autoregulation";
import { TM_FACTOR } from "@/lib/workout-program";

// ----- Types (shared with the server page) -----

export type SessionSet = {
  setNumber: number;
  percentOfTM: number | null;
  prescribedWeight: number | null;
  prescribedReps: number | null; // null on extra sets (no prescription)
  prescribedRpe: number | null;
  note: string | null;
  isExtra?: boolean; // logged beyond the program's prescription
  logged: {
    actualWeight: number | null;
    actualReps: number | null;
    actualRpe: number | null;
    e1rm: number | null;
  } | null;
};

export type SessionExercise = {
  name: string;
  originalName: string;
  lift: LiftId | null;
  // Registry attributes (lib/exercise-registry.ts) — never derived from names.
  role: "main" | "accessory";
  loadMode: "external" | "bodyweight" | "assisted";
  repMode: "reps" | "time";
  e1rmMode: "epley" | "bodyweight_epley" | "none";
  isSwapped: boolean;
  sets: SessionSet[];
};

type Logged = {
  actualWeight: number;
  actualReps: number;
  actualRpe: number | null;
  e1rm: number | null;
};

export type PrevSet = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  prescribedRpe: number | null;
};

// "@8 (prescribed @7)" — actual RPE next to what that set called for back then.
function prevRpeSuffix(prev: PrevSet): string {
  if (prev.rpe == null) return "";
  const prescribed = prev.prescribedRpe != null ? ` (prescribed @${prev.prescribedRpe})` : "";
  return ` @${prev.rpe}${prescribed}`;
}

type Props = {
  week: number;
  day: number;
  label: string;
  exercises: SessionExercise[];
  previous: Record<string, PrevSet>;
  completedAt: string | null;
  notes: Record<string, string>;
  // Latest logged body weight at the session date — used to preview e1RM for
  // bodyweight/assisted exercises. Null when never logged.
  bodyWeightKg: number | null;
};

function epley(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

function keyOf(exercise: string, setNumber: number): string {
  return `${exercise}#${setNumber}`;
}

const REST_OPTIONS: { label: string; value: number | "off" | "custom" }[] = [
  { label: "Off", value: "off" },
  { label: "90s", value: 90 },
  { label: "2 min", value: 120 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
  { label: "Custom", value: "custom" },
];

const REST_KEY = "workout.restTimer";
const BAR_WEIGHT_KEY = "bar_weight";

function SessionInner({
  week,
  day,
  exercises,
  previous,
  completedAt: initialCompletedAt,
  notes: initialNotes,
  bodyWeightKg,
}: Props) {
  const router = useRouter();

  const [logged, setLogged] = useState<Record<string, Logged>>(() => {
    const init: Record<string, Logged> = {};
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (s.logged && s.logged.actualWeight != null && s.logged.actualReps != null) {
          init[keyOf(ex.name, s.setNumber)] = {
            actualWeight: s.logged.actualWeight,
            actualReps: s.logged.actualReps,
            actualRpe: s.logged.actualRpe,
            e1rm: s.logged.e1rm,
          };
        }
      }
    }
    return init;
  });

  const [completedAt, setCompletedAt] = useState<string | null>(initialCompletedAt);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AdjustmentSuggestion[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [barKg, setBarKg] = useState<number>(20);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);

  // ----- Rest timer -----
  const [restSetting, setRestSetting] = useState<number | "off">("off");
  const [restCustom, setRestCustom] = useState<number>(150);
  // Absolute deadline (ms epoch), not a decrementing counter: background tabs
  // throttle setInterval, so the display must always be derived from
  // `restEndsAt - Date.now()` to stay correct after the tab sleeps.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REST_KEY);
      if (raw === "off" || raw == null) return;
      const n = Number(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isFinite(n) && n > 0) setRestSetting(n);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      fetch(apiUrl(`/api/workout/settings?key=${BAR_WEIGHT_KEY}`))
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const n = Number(data?.value);
          if (n === 15 || n === 20) setBarKg(n);
        })
        .catch(() => { /* ignore */ });
    } catch {
      /* ignore */
    }
  }, []);

  const persistRest = useCallback((value: number | "off") => {
    try {
      localStorage.setItem(REST_KEY, value === "off" ? "off" : String(value));
    } catch {
      /* ignore */
    }
  }, []);

  const startRest = useCallback(() => {
    if (restSetting === "off") return;
    setRestEndsAt(Date.now() + restSetting * 1000);
    setRestRemaining(restSetting);
  }, [restSetting]);

  const dismissRest = useCallback(() => {
    setRestEndsAt(null);
    setRestRemaining(null);
  }, []);

  useEffect(() => {
    if (restEndsAt == null) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    const sync = () => {
      const left = Math.ceil((restEndsAt - Date.now()) / 1000);
      if (left <= 0) {
        setRestEndsAt(null);
        setRestRemaining(null);
      } else {
        setRestRemaining(left);
      }
    };
    sync();
    tickRef.current = setInterval(sync, 1000);
    // Resync immediately when the tab wakes up instead of waiting for the
    // next (possibly throttled) interval tick.
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [restEndsAt]);

  // ----- Logging -----
  const onLogged = useCallback(
    (exercise: string, setNumber: number, value: Logged | null) => {
      setLogged((prev) => {
        const next = { ...prev };
        if (value === null) { delete next[keyOf(exercise, setNumber)]; }
        else { next[keyOf(exercise, setNumber)] = value; }
        return next;
      });
      if (value !== null) startRest();
    },
    [startRest]
  );

  // Mark the session complete (or undo) on the server and refresh.
  const finalizeSession = useCallback(
    async (action: "complete" | "uncomplete") => {
      const res = await fetch(apiUrl(`/api/workout/sessions/${week}/${day}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setCompletedAt(action === "complete" ? (data?.completedAt ?? new Date().toISOString()) : null);
      // After completing a session, push the latest data to the Google Sheet
      // in the background (best-effort — sync may not be configured).
      if (action === "complete") {
        fetch(apiUrl("/api/workout/sheets/export"), { method: "POST" }).catch(() => {});
      }
      router.refresh();
    },
    [week, day, router]
  );

  // Persist accepted TM suggestions, then mark the session complete. Other
  // lifts keep their current TM so the (all-four) endpoint stays satisfied.
  const applyAdjustments = useCallback(
    async (acceptedLifts: LiftId[]) => {
      setSheetOpen(false);
      setFinishing(true);
      setError(null);
      try {
        if (acceptedLifts.length > 0) {
          const tmRes = await fetch(apiUrl("/api/workout/training-maxes"));
          if (tmRes.ok) {
            const tmData = await tmRes.json();
            const current = (tmData?.trainingMaxes ?? {}) as Record<
              string,
              { lift: LiftId; e1rm: number; trainingMax: number }
            >;
            const factor = Number(tmData?.tmFactor) || TM_FACTOR;
            const suggMap = new Map(suggestions.map((s) => [s.lift, s.suggestedTm]));
            const acceptedSet = new Set(acceptedLifts);
            const maxes = Object.values(current).map((cur) => {
              if (acceptedSet.has(cur.lift) && suggMap.has(cur.lift)) {
                const tm = suggMap.get(cur.lift)!;
                return {
                  lift: cur.lift,
                  e1rm: Math.round((tm / factor) * 10) / 10,
                  trainingMax: tm,
                };
              }
              return { lift: cur.lift, e1rm: cur.e1rm, trainingMax: cur.trainingMax };
            });
            await fetch(apiUrl("/api/workout/training-maxes"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ maxes, autoLifts: acceptedLifts }),
            });
          }
        }
        await finalizeSession("complete");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update session");
      } finally {
        setFinishing(false);
      }
    },
    [suggestions, finalizeSession]
  );

  async function toggleFinish() {
    setError(null);
    // Undo path — no autoregulation involved.
    if (completedAt) {
      setFinishing(true);
      try {
        await finalizeSession("uncomplete");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update session");
      } finally {
        setFinishing(false);
      }
      return;
    }

    // Complete path — first ask the server for TM suggestions.
    setFinishing(true);
    try {
      const res = await fetch(apiUrl("/api/workout/autoregulate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, day }),
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      const next: AdjustmentSuggestion[] = Array.isArray(data?.suggestions)
        ? data.suggestions
        : [];
      if (next.length > 0) {
        setSuggestions(next);
        setSheetOpen(true);
        setFinishing(false);
        return; // wait for the user's decision in the sheet
      }
      await finalizeSession("complete");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update session");
    } finally {
      setFinishing(false);
    }
  }

  const totalSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const doneSets = Object.keys(logged).length;

  return (
    <main className="max-w-md mx-auto w-full px-4 py-4 pb-52 space-y-3">
      {/* Progress bar */}
      <div className="h-1 rounded-full bg-[#2a3352] overflow-hidden">
        <div
          className="h-full bg-[#e84545] transition-all duration-500"
          style={{ width: totalSets > 0 ? `${(doneSets / totalSets) * 100}%` : "0%" }}
        />
      </div>
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs text-[#8e8e93]">{doneSets} / {totalSets} sets</span>
        {completedAt && <span className="text-xs font-medium text-[#30d158]">✓ Completed</span>}
      </div>

      {exercises.map((ex) => (
        <ExerciseCard
          key={ex.originalName}
          exercise={ex}
          logged={logged}
          previous={previous}
          week={week}
          day={day}
          barKg={barKg}
          bodyWeightKg={bodyWeightKg}
          note={notes[ex.name] ?? null}
          onNoteChange={(n) => setNotes((prev) => {
            const next = { ...prev };
            if (n === null) delete next[ex.name]; else next[ex.name] = n;
            return next;
          })}
          onLogged={(setNumber, value) => onLogged(ex.name, setNumber, value as Logged | null)}
          onError={setError}
        />
      ))}

      {error && <p className="text-sm text-[#e84545] px-1">{error}</p>}

      {/* Rest timer control */}
      <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] p-4 space-y-2">
        <p className="text-xs text-[#8e8e93]">Rest timer</p>
        <div className="flex flex-wrap gap-2">
          {REST_OPTIONS.map((opt) => {
            const active =
              (opt.value === "off" && restSetting === "off") ||
              (typeof opt.value === "number" && restSetting === opt.value) ||
              (opt.value === "custom" &&
                restSetting !== "off" &&
                !REST_OPTIONS.some((o) => o.value === restSetting));
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  if (opt.value === "off") { setRestSetting("off"); persistRest("off"); }
                  else if (opt.value === "custom") { setRestSetting(restCustom); persistRest(restCustom); }
                  else { setRestSetting(opt.value); persistRest(opt.value); }
                }}
                className={`min-h-[36px] px-3 rounded-lg text-xs border transition-colors ${
                  active
                    ? "border-[#e84545] bg-[#e84545]/15 text-[#f5f5f5]"
                    : "border-[#2a3352] bg-[#242f4a] text-[#8e8e93] hover:text-[#f5f5f5]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {restSetting !== "off" && !REST_OPTIONS.some((o) => o.value === restSetting) && (
          <label className="flex items-center gap-2 pt-1">
            <span className="text-xs text-[#8e8e93]">Custom (s)</span>
            <input
              type="number"
              min={5}
              step={5}
              value={restCustom}
              onChange={(e) => {
                const n = Number(e.target.value);
                setRestCustom(n);
                if (Number.isFinite(n) && n > 0) { setRestSetting(n); persistRest(n); }
              }}
              className="w-24 rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2 text-[#f5f5f5] text-base outline-none focus:border-[#e84545]"
            />
          </label>
        )}
      </div>

      {/* Fixed finish button */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-[#141b2d]/95 backdrop-blur-sm border-t border-[#2a3352] px-4 py-3">
        <button
          type="button"
          onClick={toggleFinish}
          disabled={finishing}
          className={`w-full min-h-[52px] rounded-xl font-semibold text-base disabled:opacity-40 transition-colors ${
            completedAt
              ? "bg-[#1e2740] border border-[#30d158] text-[#30d158] hover:bg-[#242f4a]"
              : "bg-[#e84545] text-white hover:bg-[#d33a3a]"
          }`}
        >
          {finishing ? "Saving…" : completedAt ? "✓ Completed — tap to undo" : "Finish session"}
        </button>
      </div>

      {/* Sticky rest countdown */}
      {restRemaining != null && (
        <button
          type="button"
          onClick={dismissRest}
          className="fixed bottom-[72px] inset-x-0 z-30 bg-[#e84545] text-white py-3 flex items-center justify-center gap-3 active:bg-[#d33a3a]"
        >
          <span className="font-mono text-2xl tabular-nums font-bold">
            {Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, "0")}
          </span>
          <span className="text-xs uppercase tracking-widest opacity-80">tap to dismiss</span>
        </button>
      )}

      {/* Post-session TM autoregulation suggestions */}
      {sheetOpen && (
        <AutoregulateSheet suggestions={suggestions} onApply={applyAdjustments} />
      )}
    </main>
  );
}

export default function SessionClient(props: Parameters<typeof SessionInner>[0]) {
  return <UnitProvider><SessionInner {...props} /></UnitProvider>;
}

// ----- Exercise card -----

function ExerciseCard({
  exercise,
  logged,
  previous,
  week,
  day,
  barKg,
  bodyWeightKg,
  note,
  onNoteChange,
  onLogged,
  onError,
}: {
  exercise: SessionExercise;
  logged: Record<string, Logged>;
  previous: Record<string, PrevSet>;
  week: number;
  day: number;
  barKg: number;
  bodyWeightKg: number | null;
  note: string | null;
  onNoteChange: (note: string | null) => void;
  onLogged: (setNumber: number, value: Logged | null) => void;
  onError: (msg: string | null) => void;
}) {
  // Registry role, not `lift === null` — the add-set gate must survive
  // program/registry edits (roadmap 3.2).
  const isAccessory = exercise.role === "accessory";
  const programSets = exercise.sets.filter((s) => !s.isExtra);
  // Extra sets: persisted ones arrive via props; newly added ones live here.
  const [extraSets, setExtraSets] = useState<SessionSet[]>(
    exercise.sets.filter((s) => s.isExtra)
  );
  const allSets = [...programSets, ...extraSets];
  const highestExtra = extraSets.length > 0 ? extraSets[extraSets.length - 1].setNumber : null;

  function addExtraSet() {
    const nextNumber = Math.max(...allSets.map((s) => s.setNumber)) + 1;
    setExtraSets((prev) => [
      ...prev,
      {
        setNumber: nextNumber,
        percentOfTM: null,
        prescribedWeight: null,
        prescribedReps: null,
        prescribedRpe: null,
        note: null,
        isExtra: true,
        logged: null,
      },
    ]);
  }

  const allLogged = allSets.every((s) => logged[keyOf(exercise.name, s.setNumber)]);
  const lastSet = previous[keyOf(exercise.name, 1)];

  const repRange = programSets.length > 0
    ? [...new Set(programSets.map((s) => s.prescribedReps))]
        .join("–")
    : null;

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(note ?? "");
  const [noteSaving, setNoteSaving] = useState(false);

  async function saveNote() {
    setNoteSaving(true);
    try {
      const res = await fetch(apiUrl("/api/workout/notes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, day, exercise: exercise.name, note: noteText }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      onNoteChange(noteText);
      setNoteOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setNoteSaving(false);
    }
  }

  async function clearNote() {
    setNoteSaving(true);
    try {
      const params = new URLSearchParams({
        week: String(week),
        day: String(day),
        exercise: exercise.name,
      });
      const res = await fetch(apiUrl(`/api/workout/notes?${params}`), { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setNoteText("");
      onNoteChange(null);
      setNoteOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not clear note");
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <div className="flex rounded-xl overflow-hidden border border-[#2a3352] bg-[#1e2740]">
      {/* Left border bar */}
      <div className={`w-1 flex-shrink-0 ${allLogged ? "bg-[#30d158]" : "bg-[#e84545]"}`} />

      <div className="flex-1 min-w-0">
        {/* Card header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="text-xl font-bold text-[#f5f5f5] leading-tight">{exercise.name}</h3>
            {lastSet?.weight != null && (
              <p className="text-xs italic text-[#8e8e93] mt-1">
                Last set · {lastSet.weight}kg × {lastSet.reps}{prevRpeSuffix(lastSet)}
              </p>
            )}
            <p className="text-xs text-[#8e8e93] mt-0.5">
              {exercise.sets.length} sets{repRange ? ` × ${repRange} ${exercise.repMode === "time" ? "s" : "reps"}` : ""}
              {isAccessory && <span className="ml-1 text-[#8e8e93]">· accessory</span>}
            </p>
          </div>
          <div className="flex items-center gap-3 pt-0.5">
            <SwapSheet
              exercise={exercise.originalName}
              week={week}
              day={day}
              isSwapped={exercise.isSwapped}
              onSwapped={() => { window.location.reload(); }}
            />
          </div>
        </div>

        {/* Set rows — track last logged weight to autofill subsequent sets */}
        <div className="border-t border-[#2a3352] divide-y divide-[#2a3352]">
          {allSets.map((s) => {
            const prevLoggedWeight = (() => {
              for (let n = s.setNumber - 1; n >= 1; n--) {
                const l = logged[keyOf(exercise.name, n)];
                if (l?.actualWeight != null) return l.actualWeight;
              }
              return null;
            })();
            return (
              <SetRow
                key={s.setNumber}
                exerciseName={exercise.name}
                set={s}
                week={week}
                day={day}
                barKg={barKg}
                loadMode={exercise.loadMode}
                repMode={exercise.repMode}
                e1rmMode={exercise.e1rmMode}
                bodyWeightKg={bodyWeightKg}
                logged={logged[keyOf(exercise.name, s.setNumber)] ?? null}
                prev={previous[keyOf(exercise.name, s.setNumber)] ?? null}
                suggestedWeight={prevLoggedWeight}
                onLogged={onLogged}
                onError={onError}
                // Only the highest extra set is removable — no renumbering,
                // no _key churn in the sheet.
                onRemove={
                  s.isExtra && s.setNumber === highestExtra
                    ? () => setExtraSets((prev) => prev.filter((x) => x.setNumber !== s.setNumber))
                    : undefined
                }
              />
            );
          })}
          {isAccessory && (
            <button
              type="button"
              onClick={addExtraSet}
              className="w-full min-h-[44px] text-sm text-[#3d5080] hover:text-[#8e8e93] transition-colors"
            >
              + Add set
            </button>
          )}
        </div>

        {/* Notes footer */}
        <div className="px-4 py-2 border-t border-[#2a3352]">
          <button
            type="button"
            onClick={() => {
              setNoteText(note ?? "");
              setNoteOpen((v) => !v);
            }}
            className="text-xs text-[#3d5080] hover:text-[#8e8e93] transition-colors min-h-[36px] flex items-center gap-1"
          >
            Notes ✏
          </button>
          {note && !noteOpen && (
            <p className="text-xs text-[#8e8e93] mt-1 leading-relaxed whitespace-pre-wrap">{note}</p>
          )}
          {noteOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note for this exercise…"
                className="w-full rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2 text-[#f5f5f5] text-sm outline-none focus:border-[#e84545] resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={noteSaving}
                  className="flex-1 min-h-[40px] rounded-lg bg-[#e84545] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#d33a3a] transition-colors"
                >
                  {noteSaving ? "Saving…" : "Save"}
                </button>
                {note && (
                  <button
                    type="button"
                    onClick={clearNote}
                    disabled={noteSaving}
                    className="min-h-[40px] px-4 rounded-lg border border-[#2a3352] text-[#8e8e93] text-sm font-medium disabled:opacity-40 hover:border-[#e84545] hover:text-[#e84545] transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- Set row -----

function SetRow({
  exerciseName,
  set,
  week,
  day,
  barKg,
  loadMode,
  repMode,
  e1rmMode,
  bodyWeightKg,
  logged,
  prev,
  suggestedWeight,
  onLogged,
  onError,
  onRemove,
}: {
  exerciseName: string;
  set: SessionSet;
  week: number;
  day: number;
  barKg: number;
  loadMode: SessionExercise["loadMode"];
  repMode: SessionExercise["repMode"];
  e1rmMode: SessionExercise["e1rmMode"];
  bodyWeightKg: number | null;
  logged: Logged | null;
  prev: PrevSet | null;
  suggestedWeight: number | null;
  onLogged: (setNumber: number, value: Logged | null) => void;
  onError: (msg: string | null) => void;
  onRemove?: () => void; // set on removable extra sets only
}) {
  const { unit } = useUnit();
  const [expanded, setExpanded] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Input weight is always in the user's preferred unit; convert to kg on save.
  function toInputWeight(kg: number | null): string {
    if (kg == null) return "";
    if (unit === "lbs") return String(Math.round(kg * 2.20462));
    return String(kg);
  }

  // Priority: already-logged weight > previously logged set in this session (autofill) > prescribed weight
  const [weight, setWeight] = useState<string>(
    logged?.actualWeight != null
      ? toInputWeight(logged.actualWeight)
      : suggestedWeight != null
        ? toInputWeight(suggestedWeight)
        : toInputWeight(set.prescribedWeight)
  );
  const [reps, setReps] = useState<string>(
    logged?.actualReps != null
      ? String(logged.actualReps)
      : set.prescribedReps != null
        ? String(set.prescribedReps)
        : ""
  );
  const [rpe, setRpe] = useState<number>(logged?.actualRpe ?? set.prescribedRpe ?? 8);
  const [saving, setSaving] = useState(false);

  // Assisted exercises log negative external weight (assistance); everything
  // else stays ≥ 0 (server enforces the same rule, load-mode-aware).
  const allowNegative = loadMode === "assisted";

  async function save() {
    const wDisplay = Number(weight);
    const r = Number(reps);
    if (!Number.isFinite(wDisplay) || (!allowNegative && wDisplay < 0)) {
      return onError("Enter a valid weight");
    }
    if (!Number.isInteger(r) || r < 1) {
      return onError(repMode === "time" ? "Enter valid seconds" : "Enter valid reps");
    }
    // Always store in kg
    const w = unit === "lbs" ? Math.round(wDisplay * displayToKg(1, "lbs") * 10) / 10 : wDisplay;
    onError(null);
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/workout/sets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week, day,
          exercise: exerciseName,
          setNumber: set.setNumber,
          actualWeight: w, actualReps: r, actualRpe: rpe,
          prescribedWeight: set.prescribedWeight,
          prescribedReps: set.prescribedReps,
          prescribedRpe: set.prescribedRpe,
        }),
      });
      if (!res.ok) throw new Error(`Log failed (${res.status})`);
      const saved = await res.json();
      onLogged(set.setNumber, {
        actualWeight: saved.actualWeight ?? w,
        actualReps: saved.actualReps ?? r,
        actualRpe: saved.actualRpe ?? rpe,
        // Server is authoritative: null is a valid e1RM (e1rm_mode none,
        // bodyweight without a logged BW, timed sets).
        e1rm: saved.e1rm ?? null,
      });
      setExpanded(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not log set");
    } finally {
      setSaving(false);
    }
  }

  const isLogged = !!logged;
  // Live e1RM preview mirrors the server's computeSetE1rm: bodyweight modes
  // add the latest body weight to the (kg-converted) external weight.
  const liveE1rm = (() => {
    if (logged?.e1rm != null) return logged.e1rm;
    if (e1rmMode === "none" || repMode === "time") return null;
    const wDisplay = Number(weight);
    const r = Number(reps);
    if (!Number.isFinite(wDisplay) || r < 1) return null;
    const wKg = unit === "lbs" ? wDisplay * displayToKg(1, "lbs") : wDisplay;
    if (e1rmMode === "bodyweight_epley") {
      if (bodyWeightKg == null || bodyWeightKg + wKg <= 0) return null;
      return epley(Math.round((bodyWeightKg + wKg) * 10) / 10, r);
    }
    return wKg > 0 ? epley(wKg, r) : null;
  })();

  // "BW − 20 kg" style annotation for bodyweight/assisted exercises.
  const effectiveLoadLabel = (() => {
    if (loadMode === "external") return null;
    const wKg = Number.isFinite(Number(weight))
      ? (unit === "lbs" ? Number(weight) * displayToKg(1, "lbs") : Number(weight))
      : 0;
    const rounded = Math.round(Math.abs(wKg) * 10) / 10;
    const sign = wKg < 0 ? "−" : "+";
    const base = rounded === 0 ? "BW" : `BW ${sign} ${rounded} kg`;
    return bodyWeightKg != null
      ? `${base} = ${Math.round((bodyWeightKg + wKg) * 10) / 10} kg`
      : `${base} (log body weight for e1RM)`;
  })();

  return (
    <div className="px-4 py-3">
      {/* Main row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 text-left min-h-[44px]"
      >
        {/* Numbered circle */}
        <div
          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold transition-colors ${
            isLogged
              ? "bg-[#e84545] text-white"
              : "bg-[#2a3352] text-[#8e8e93]"
          }`}
        >
          {set.setNumber}
        </div>

        {/* Prescribed info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#f5f5f5]">
              {kgToDisplay(set.prescribedWeight, unit)}
            </span>
            {set.prescribedWeight != null && (
              <button
                type="button"
                aria-label="Show plate loading"
                onClick={(e) => { e.stopPropagation(); setPlateOpen((v) => !v); }}
                className={`leading-none transition-colors ${
                  plateOpen ? "text-[#e84545]" : "text-[#3d5080] hover:text-[#8e8e93]"
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="1" y1="12" x2="4" y2="12" />
                  <rect x="4" y="7" width="3" height="10" rx="1" fill="currentColor" stroke="none" />
                  <rect x="17" y="7" width="3" height="10" rx="1" fill="currentColor" stroke="none" />
                  <line x1="7" y1="12" x2="17" y2="12" />
                  <line x1="20" y1="12" x2="23" y2="12" />
                </svg>
              </button>
            )}
            {set.note && (
              <span className="text-[10px] text-[#8e8e93] uppercase tracking-wide">
                {set.note}
              </span>
            )}
          </div>
          {prev?.weight != null && !isLogged && (
            <p className="text-[10px] italic text-[#8e8e93]/70 mt-0.5">
              prev {kgToDisplay(prev.weight, unit)} × {prev.reps}{prevRpeSuffix(prev)}
            </p>
          )}
        </div>

        {/* Result pill or prescribed RPE pill */}
        {isLogged ? (
          <div className="flex-shrink-0 rounded-full bg-[#e84545]/20 border border-[#e84545]/40 px-3 py-1">
            <span className="text-xs font-medium text-[#e84545] whitespace-nowrap">
              {kgToDisplay(logged.actualWeight, unit)} × {logged.actualReps}
              {logged.actualRpe != null && ` @ ${logged.actualRpe} RPE`}
            </span>
          </div>
        ) : (
          <div className="flex-shrink-0 rounded-full bg-[#242f4a] border border-[#2a3352] px-3 py-1">
            <span className={`text-xs text-[#8e8e93] whitespace-nowrap ${set.prescribedRpe != null ? "font-bold" : ""}`}>
              {set.prescribedRpe != null
                ? `RPE ${set.prescribedRpe}`
                : set.prescribedReps != null
                  ? `${set.prescribedReps} reps`
                  : "extra"}
            </span>
          </div>
        )}
      </button>

      {/* Plate loading preview */}
      {plateOpen && set.prescribedWeight != null && (
        <PlatePreview
          targetKg={set.prescribedWeight}
          barKg={barKg}
          unit={unit}
        />
      )}

      {/* Inline log form */}
      {expanded && (
        <div className="mt-3 space-y-3 pl-11">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-[#8e8e93]">
                {loadMode === "assisted"
                  ? `Assist / extra (${unitLabel(unit)})`
                  : loadMode === "bodyweight"
                    ? `Added weight (${unitLabel(unit)})`
                    : `Weight (${unitLabel(unit)})`}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={allowNegative ? undefined : 0}
                step={2.5}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2.5 text-[#f5f5f5] text-lg outline-none focus:border-[#e84545]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8e8e93]">{repMode === "time" ? "Seconds" : "Reps"}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#242f4a] border border-[#2a3352] px-3 py-2.5 text-[#f5f5f5] text-lg outline-none focus:border-[#e84545]"
              />
            </label>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8e8e93]">RPE</span>
              <span className="text-sm font-mono font-bold text-[#f5f5f5]">{rpe.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={6}
              max={10}
              step={0.5}
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="w-full h-2 accent-[#e84545]"
              style={{ accentColor: "#e84545" }}
            />
          </div>

          {effectiveLoadLabel && (
            <p className="text-xs text-[#8e8e93]">{effectiveLoadLabel}</p>
          )}
          {liveE1rm != null && (
            <p className="text-xs text-[#8e8e93]">
              e1RM <span className="text-[#f5f5f5] font-mono font-semibold">{liveE1rm} kg</span>
            </p>
          )}

          <div className={`flex gap-2 ${isLogged ? "" : ""}`}>
            <button
              type="button"
              onClick={save}
              disabled={saving || removing}
              className="flex-1 min-h-[48px] rounded-xl bg-[#e84545] text-white font-semibold disabled:opacity-40 hover:bg-[#d33a3a] transition-colors"
            >
              {saving ? "Logging…" : isLogged ? "Update set" : "Log set"}
            </button>
            {(isLogged || onRemove) && (
              <button
                type="button"
                disabled={removing || saving}
                onClick={async () => {
                  // Unlogged extra set: nothing in the DB, just drop the row.
                  if (!isLogged) {
                    onRemove?.();
                    return;
                  }
                  setRemoving(true);
                  onError(null);
                  try {
                    const params = new URLSearchParams({
                      week: String(week),
                      day: String(day),
                      exercise: exerciseName,
                      setNumber: String(set.setNumber),
                    });
                    const res = await fetch(apiUrl(`/api/workout/sets?${params}`), { method: "DELETE" });
                    if (!res.ok) throw new Error(`Remove failed (${res.status})`);
                    onLogged(set.setNumber, null as unknown as Logged);
                    setExpanded(false);
                    onRemove?.();
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "Could not remove set");
                  } finally {
                    setRemoving(false);
                  }
                }}
                className="min-h-[48px] px-4 rounded-xl border border-[#2a3352] text-[#8e8e93] font-medium disabled:opacity-40 hover:border-[#e84545] hover:text-[#e84545] transition-colors"
              >
                {removing ? "…" : "Remove"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Plate preview -----

const PLATE_COLORS: Record<number, { bg: string; text: string }> = {
  25: { bg: "#c0392b", text: "#ffffff" },
  20: { bg: "#2980b9", text: "#ffffff" },
  15: { bg: "#f1c40f", text: "#1a1a1a" },
  10: { bg: "#27ae60", text: "#ffffff" },
  5: { bg: "#ecf0f1", text: "#1a1a1a" },
  2.5: { bg: "#bdc3c7", text: "#1a1a1a" },
  1.25: { bg: "#95a5a6", text: "#1a1a1a" },
};

function PlatePreview({ targetKg, barKg, unit }: { targetKg: number; barKg: number; unit: Unit }) {
  const result = calculatePlates(targetKg, barKg);

  const barDisplay = unit === "lbs"
    ? `${Math.round(barKg * KG_TO_LBS)} lbs`
    : `${barKg} kg`;

  if (!result.possible) {
    const actualDisplay = unit === "lbs"
      ? `${Math.round(result.actualTotal * KG_TO_LBS)} lbs`
      : `${result.actualTotal} kg`;
    return (
      <div className="mt-1 mb-2 ml-11 px-3 py-2 rounded-lg bg-[#242f4a] border border-[#2a3352]">
        <p className="text-xs text-[#8e8e93]">
          Bar: {barDisplay} · Cannot load exactly — nearest: {actualDisplay}
        </p>
      </div>
    );
  }

  if (result.perSide.length === 0) {
    return (
      <div className="mt-1 mb-2 ml-11 px-3 py-2 rounded-lg bg-[#242f4a] border border-[#2a3352]">
        <p className="text-xs text-[#8e8e93]">Bar only: {barDisplay}</p>
      </div>
    );
  }

  const perSideText = result.perSide
    .map((p) => `${p.count}×${p.weight}`)
    .join(" + ");

  return (
    <div className="mt-1 mb-2 ml-11 px-3 py-2 rounded-lg bg-[#242f4a] border border-[#2a3352] space-y-2">
      <p className="text-xs text-[#8e8e93]">
        Bar: {barDisplay} · Per side: {perSideText}
      </p>
      <div className="flex items-center gap-1 flex-wrap">
        {result.perSide.flatMap((p) =>
          Array.from({ length: p.count }, (_, i) => {
            const color = PLATE_COLORS[p.weight] ?? { bg: "#8e8e93", text: "#fff" };
            return (
              <span
                key={`${p.weight}-${i}`}
                style={{ backgroundColor: color.bg, color: color.text }}
                className="inline-flex items-center justify-center rounded-full text-[10px] font-bold w-8 h-8 flex-shrink-0 border border-black/20"
              >
                {p.weight}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
