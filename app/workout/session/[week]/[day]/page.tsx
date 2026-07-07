import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  getTrainingMaxes,
  getSession,
  getSetsForSession,
  getPreviousSetMap,
  getSwapsForSession,
  getNotesForSession,
  isOnboarded,
} from "@/lib/workout";
import {
  getProgramDay,
  prescribedWeight,
  PROGRAM_WEEKS,
  PROGRAM_DAYS,
} from "@/lib/workout-program";
import SessionClient, {
  type SessionExercise,
  type PrevSet,
} from "@/components/workout/session-client";
import WorkoutTabBar from "@/components/workout/workout-tab-bar";
import SessionTimer from "@/components/workout/session-timer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ week: string; day: string }> };

export default async function SessionPage({ params }: Params) {
  const session = await auth();
  if (!session) redirect("/login");

  const { week: weekStr, day: dayStr } = await params;
  const week = Number(weekStr);
  const day = Number(dayStr);
  if (
    !Number.isInteger(week) ||
    !Number.isInteger(day) ||
    week < 1 ||
    week > PROGRAM_WEEKS ||
    day < 1 ||
    day > PROGRAM_DAYS
  ) {
    notFound();
  }

  if (!isOnboarded()) redirect("/workout");

  const programDay = getProgramDay(week, day);
  if (!programDay) notFound();

  const tms = getTrainingMaxes();
  // Sessions are started explicitly from the preview screen — never on render.
  const sessionRow = getSession(week, day);
  if (!sessionRow?.startedAt) redirect(`/workout/preview/${week}/${day}`);
  const loggedSets = getSetsForSession(week, day);

  // Map logged rows by "<exercise>#<setNumber>" for quick lookup.
  const loggedMap: Record<
    string,
    { actualWeight: number | null; actualReps: number | null; actualRpe: number | null; e1rm: number | null }
  > = {};
  for (const s of loggedSets) {
    if (s.loggedAt) {
      loggedMap[`${s.exercise}#${s.setNumber}`] = {
        actualWeight: s.actualWeight,
        actualReps: s.actualReps,
        actualRpe: s.actualRpe,
        e1rm: s.e1rm,
      };
    }
  }

  // Active exercise swaps for this session
  const swapMap = getSwapsForSession(week, day);

  // Build the prescribed view + collect refs for previous-session lookups.
  const refs: { exercise: string; setNumber: number }[] = [];
  const exercises: SessionExercise[] = programDay.exercises.map((ex) => {
    const effectiveName = swapMap[ex.name] ?? ex.name;
    const tm = ex.lift ? tms[ex.lift]?.trainingMax : undefined;
    return {
      name: effectiveName,
      originalName: ex.name,
      lift: ex.lift,
      isSwapped: effectiveName !== ex.name,
      sets: ex.sets.map((set) => {
        refs.push({ exercise: effectiveName, setNumber: set.setNumber });
        const pWeight = prescribedWeight(tm, set.percentOfTM);
        const logged = loggedMap[`${effectiveName}#${set.setNumber}`] ?? null;
        return {
          setNumber: set.setNumber,
          percentOfTM: set.percentOfTM,
          prescribedWeight: pWeight,
          prescribedReps: set.reps,
          prescribedRpe: set.rpe,
          note: set.note ?? null,
          logged,
        };
      }),
    };
  });

  // Persisted extra sets (logged beyond the prescription) must survive reload.
  for (const ex of exercises) {
    const maxPrescribed = Math.max(0, ...ex.sets.map((s) => s.setNumber));
    const extraRows = loggedSets
      .filter((s) => s.loggedAt && s.exercise === ex.name && s.setNumber > maxPrescribed)
      .sort((a, b) => a.setNumber - b.setNumber);
    for (const s of extraRows) {
      ex.sets.push({
        setNumber: s.setNumber,
        percentOfTM: null,
        prescribedWeight: null,
        prescribedReps: null,
        prescribedRpe: null,
        note: null,
        isExtra: true,
        logged: {
          actualWeight: s.actualWeight,
          actualReps: s.actualReps,
          actualRpe: s.actualRpe,
          e1rm: s.e1rm,
        },
      });
    }
  }

  const prevMap = getPreviousSetMap(week, day, refs);
  const previous: Record<string, PrevSet> = {};
  for (const [k, v] of Object.entries(prevMap)) {
    previous[k] = {
      weight: v.actualWeight,
      reps: v.actualReps,
      rpe: v.actualRpe,
      prescribedRpe: v.prescribedRpe,
    };
  }

  const notes = getNotesForSession(week, day);

  // Prev / next day navigation (wraps across weeks)
  const totalDays = PROGRAM_WEEKS * PROGRAM_DAYS;
  const currentIndex = (week - 1) * PROGRAM_DAYS + (day - 1); // 0-based
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : null;
  const nextIndex = currentIndex < totalDays - 1 ? currentIndex + 1 : null;
  const prevHref = prevIndex !== null
    ? `/workout/session/${Math.floor(prevIndex / PROGRAM_DAYS) + 1}/${(prevIndex % PROGRAM_DAYS) + 1}`
    : null;
  const nextHref = nextIndex !== null
    ? `/workout/session/${Math.floor(nextIndex / PROGRAM_DAYS) + 1}/${(nextIndex % PROGRAM_DAYS) + 1}`
    : null;

  return (
    <div className="min-h-screen bg-[#141b2d] text-[#f5f5f5]">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-[#141b2d]/95 backdrop-blur-sm border-b border-[#2a3352]">
        {/* Top bar: back + nav arrows */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <Link
            href="/workout"
            className="flex items-center gap-1 text-[#e84545] text-sm font-medium"
          >
            ‹ Overview
          </Link>
          <div className="flex items-center gap-1">
            {prevHref ? (
              <Link href={prevHref} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#8e8e93] hover:text-[#f5f5f5] hover:bg-[#1e2740] transition-colors text-xl font-light">‹</Link>
            ) : (
              <span className="w-9 h-9 flex items-center justify-center text-[#2a3352] text-xl font-light">‹</span>
            )}
            {nextHref ? (
              <Link href={nextHref} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#8e8e93] hover:text-[#f5f5f5] hover:bg-[#1e2740] transition-colors text-xl font-light">›</Link>
            ) : (
              <span className="w-9 h-9 flex items-center justify-center text-[#2a3352] text-xl font-light">›</span>
            )}
          </div>
        </div>
        {/* Big week/day display */}
        <div className="px-4 pb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold text-[#e84545] uppercase tracking-widest">{programDay.label}</p>
            <div className="flex items-baseline gap-3">
              <span className="text-base font-semibold text-[#8e8e93]">Week {week}</span>
              <span className="text-4xl font-black text-[#f5f5f5] leading-none">Day {day}</span>
            </div>
          </div>
          {sessionRow.startedAt && !sessionRow.completedAt && (
            <SessionTimer startedAt={sessionRow.startedAt} />
          )}
        </div>
      </header>

      <SessionClient
        week={week}
        day={day}
        label={programDay.label}
        exercises={exercises}
        previous={previous}
        completedAt={sessionRow?.completedAt ?? null}
        notes={notes}
      />
      <WorkoutTabBar />
    </div>
  );
}
