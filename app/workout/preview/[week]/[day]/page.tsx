import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isOnboarded, getTrainingMaxes } from "@/lib/workout";
import {
  getProgramDay,
  prescribedWeight,
  PROGRAM_WEEKS,
  PROGRAM_DAYS,
} from "@/lib/workout-program";
import WorkoutTabBar from "@/components/workout/workout-tab-bar";
import WarmupChecklist from "@/components/workout/warmup-checklist";
import { getWarmup } from "@/lib/warmup-routines";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ week: string; day: string }> };

export default async function PreviewPage({ params }: Params) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isOnboarded()) redirect("/workout");

  const { week: weekStr, day: dayStr } = await params;
  const week = Number(weekStr);
  const day = Number(dayStr);

  if (
    !Number.isInteger(week) || !Number.isInteger(day) ||
    week < 1 || week > PROGRAM_WEEKS || day < 1 || day > PROGRAM_DAYS
  ) notFound();

  const programDay = getProgramDay(week, day);
  if (!programDay) notFound();

  const tms = getTrainingMaxes();
  const warmup = getWarmup(programDay.label);

  // Prev / next for navigation arrows
  const totalDays = PROGRAM_WEEKS * PROGRAM_DAYS;
  const currentIndex = (week - 1) * PROGRAM_DAYS + (day - 1);
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : null;
  const nextIndex = currentIndex < totalDays - 1 ? currentIndex + 1 : null;
  const prevHref = prevIndex !== null
    ? `/workout/preview/${Math.floor(prevIndex / PROGRAM_DAYS) + 1}/${(prevIndex % PROGRAM_DAYS) + 1}`
    : null;
  const nextHref = nextIndex !== null
    ? `/workout/preview/${Math.floor(nextIndex / PROGRAM_DAYS) + 1}/${(nextIndex % PROGRAM_DAYS) + 1}`
    : null;

  return (
    <div className="min-h-screen bg-[#141b2d] text-[#f5f5f5]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#141b2d]/95 backdrop-blur-sm border-b border-[#2a3352]">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <Link href="/workout" className="text-[#e84545] text-sm font-medium">
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
        <div className="px-4 pb-3">
          <p className="text-xs font-semibold text-[#e84545] uppercase tracking-widest">{programDay.label}</p>
          <div className="flex items-baseline gap-3">
            <span className="text-base font-semibold text-[#8e8e93]">Week {week}</span>
            <span className="text-4xl font-black text-[#f5f5f5] leading-none">Day {day}</span>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto w-full px-4 py-5 pb-28 space-y-4">
        {/* CTAs */}
        <Link
          href={`/workout/session/${week}/${day}`}
          className="flex items-center justify-center gap-2 w-full min-h-[56px] rounded-xl bg-[#e84545] text-white font-semibold text-lg hover:bg-[#d33a3a] transition-colors"
        >
          Start Training →
        </Link>
        <div className="flex gap-3">
          <Link
            href="/workout"
            className="flex-1 flex items-center justify-center min-h-[44px] rounded-xl border border-[#2a3352] bg-[#1e2740] text-[#8e8e93] text-sm font-medium hover:text-[#f5f5f5] hover:bg-[#242f4a] transition-colors"
          >
            Skip workout
          </Link>
          <Link
            href={`/workout/session/${week}/${day}`}
            className="flex-1 flex items-center justify-center min-h-[44px] rounded-xl border border-[#2a3352] bg-[#1e2740] text-[#8e8e93] text-sm font-medium hover:text-[#f5f5f5] hover:bg-[#242f4a] transition-colors"
          >
            Go to log
          </Link>
        </div>

        {/* Warm-up */}
        <WarmupChecklist drills={warmup} />

        {/* Exercise overview */}
        <div>
          <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-widest mb-3 px-1">
            Overview
          </p>
          <div className="space-y-2">
            {programDay.exercises.map((ex) => {
              const tm = ex.lift ? tms[ex.lift]?.trainingMax : undefined;
              const firstSetWeight = ex.sets[0]
                ? prescribedWeight(tm, ex.sets[0].percentOfTM)
                : null;

              const setsLabel = `${ex.sets.length} sets × ${ex.sets[0]?.reps ?? "—"} reps`;
              const weightLabel = firstSetWeight != null ? ` · ~${firstSetWeight}kg` : "";
              const rpeLabel = ex.sets[0]?.rpe != null ? ` @ RPE ${ex.sets[0].rpe}` : "";

              return (
                <div
                  key={ex.name}
                  className="flex rounded-xl overflow-hidden border border-[#2a3352] bg-[#1e2740]"
                >
                  {/* Left bar — red for main lifts, muted for accessories */}
                  <div className={`w-1 flex-shrink-0 ${ex.lift !== null ? "bg-[#e84545]" : "bg-[#2a3352]"}`} />
                  <div className="flex-1 flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-[#f5f5f5]">{ex.name}</p>
                      <p className="text-xs text-[#8e8e93] mt-0.5">
                        {setsLabel}{weightLabel}{rpeLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="text-[#3d5080] text-base select-none">ⓘ</span>
                      <span className="text-[#3d5080] text-base select-none">⇄</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <WorkoutTabBar />
    </div>
  );
}
