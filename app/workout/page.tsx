import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LIFTS, getTrainingMaxes, isOnboarded, listSessions, getDaysOut, getPlannedWeeklyVolume } from "@/lib/workout";
import OnboardingForm from "@/components/workout/onboarding-form";
import ProgramOverview from "@/components/workout/program-overview";
import WorkoutTabBar from "@/components/workout/workout-tab-bar";
import { PROGRAM_WEEKS, PROGRAM_DAYS } from "@/lib/workout-program";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkoutPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const onboarded = isOnboarded();
  const tms = getTrainingMaxes();
  const sessions = onboarded ? listSessions() : [];
  const daysOut = getDaysOut();
  const weeklyVolume = onboarded ? getPlannedWeeklyVolume() : [];

  return (
    <div className="min-h-screen bg-[#141b2d] text-[#f5f5f5]">
      <header className="sticky top-0 z-10 bg-[#141b2d]/95 backdrop-blur-sm border-b border-[#2a3352] px-5 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Chuggernaut</span>
        <span className="text-xs text-[#8e8e93]">Calgary Barbell 16-week</span>
      </header>

      <main className="max-w-md mx-auto w-full px-4 py-6 pb-24">
        {!onboarded ? (
          <OnboardingForm />
        ) : (
          <div className="space-y-5">
            {/* Training maxes — compact tappable row */}
            <Link
              href="/workout/settings"
              className="flex items-center justify-between rounded-xl border border-[#2a3352] bg-[#1e2740] px-4 py-3 hover:bg-[#242f4a] transition-colors"
            >
              <span className="text-xs text-[#8e8e93]">Training maxes</span>
              <span className="text-xs text-[#8e8e93] font-mono">
                {LIFTS.map((l) => {
                  const tm = tms[l.id];
                  return tm ? `${l.label.split(" ")[0]} ${tm.trainingMax}` : null;
                }).filter(Boolean).join(" · ")} →
              </span>
            </Link>

            <ProgramOverview sessions={sessions} daysOut={daysOut} weeklyVolume={weeklyVolume} />
          </div>
        )}
      </main>

      <WorkoutTabBar />
    </div>
  );
}
