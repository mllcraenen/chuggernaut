import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isOnboarded, getE1rmHistory, getCompletedSessions, getBodyWeightHistory, LIFTS } from "@/lib/workout";
import WorkoutTabBar from "@/components/workout/workout-tab-bar";
import { importIfStale } from "@/lib/workout-sheets";
import E1rmChart from "@/components/workout/e1rm-chart";
import BodyWeightSection from "@/components/workout/body-weight-section";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HistoryPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isOnboarded()) redirect("/workout");

  await importIfStale();

  const e1rmHistory = Object.fromEntries(
    LIFTS.map((l) => [l.id, getE1rmHistory(l.id)])
  );
  const sessions = getCompletedSessions();
  const bodyWeight = getBodyWeightHistory();

  return (
    <div className="min-h-screen bg-[#141b2d] text-[#f5f5f5]">
      <header className="sticky top-0 z-20 bg-[#141b2d]/95 backdrop-blur-sm border-b border-[#2a3352] px-4 py-4">
        <h1 className="text-base font-semibold">History</h1>
      </header>

      <main className="max-w-md mx-auto w-full px-4 py-5 pb-24 space-y-6">
        <BodyWeightSection initial={bodyWeight} />

        {sessions.length === 0 ? (
          <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] px-5 py-8 text-center">
            <p className="text-[#8e8e93] text-sm">No completed sessions yet.</p>
            <p className="text-[#3d5080] text-xs mt-1">Complete your first session to see progress here.</p>
          </div>
        ) : (
          <>
            {/* e1RM charts per lift */}
            <section className="space-y-3">
              <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-widest px-1">
                Estimated 1RM progress
              </p>
              {LIFTS.map((lift) => {
                const points = e1rmHistory[lift.id] ?? [];
                return (
                  <div key={lift.id} className="rounded-xl border border-[#2a3352] bg-[#1e2740] overflow-hidden">
                    <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
                      <span className="text-sm font-bold text-[#f5f5f5]">{lift.label}</span>
                      {points.length > 0 && (
                        <span className="text-sm font-mono text-[#e84545]">
                          {points[points.length - 1].e1rm} kg
                        </span>
                      )}
                    </div>
                    {points.length < 2 ? (
                      <p className="px-4 pb-3 text-xs text-[#3d5080]">
                        {points.length === 0 ? "No data yet" : "Log more sessions to see a trend"}
                      </p>
                    ) : (
                      <E1rmChart points={points} />
                    )}
                  </div>
                );
              })}
            </section>

            {/* Session log */}
            <section className="space-y-3">
              <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-widest px-1">
                Completed sessions
              </p>
              <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] divide-y divide-[#2a3352] overflow-hidden">
                {sessions.map((s) => {
                  const date = new Date(s.completedAt).toLocaleDateString("nl-NL", {
                    day: "numeric", month: "short", year: "numeric",
                  });
                  return (
                    <Link
                      key={`${s.week}-${s.day}`}
                      href={`/workout/session/${s.week}/${s.day}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[#242f4a] transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#f5f5f5]">
                          Week {s.week} · Day {s.day}
                        </p>
                        <p className="text-xs text-[#8e8e93]">{date} · {s.setCount} sets</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono text-[#8e8e93]">
                          {(s.totalVolume / 1000).toFixed(1)}t vol
                        </p>
                        <span className="text-[#3d5080] text-sm">›</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      <WorkoutTabBar />
    </div>
  );
}
