import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import WorkoutTabBar from "@/components/workout/workout-tab-bar";
import ExerciseManager from "@/components/workout/exercise-manager";
import { listExercises, getAlternativeIds, isExerciseReferenced } from "@/lib/exercise-registry";
import { LIFTS } from "@/lib/workout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExercisesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const exercises = listExercises({ includeArchived: true }).map((e) => ({
    ...e,
    alternativeIds: getAlternativeIds(e.id),
    referenced: isExerciseReferenced(e.name),
  }));

  return (
    <div className="min-h-screen bg-[#141b2d] text-[#f5f5f5]">
      <header className="sticky top-0 z-10 bg-[#141b2d] border-b border-[#2a3352] px-5 py-4 flex items-center justify-between">
        <span className="text-sm font-medium tracking-tight">Exercises</span>
        <Link
          href="/workout/settings"
          className="text-xs text-[#8e8e93] hover:text-[#f5f5f5] transition-colors"
        >
          ← Settings
        </Link>
      </header>

      <main className="max-w-md mx-auto w-full px-4 py-6 pb-24">
        <ExerciseManager initialExercises={exercises} lifts={LIFTS} />
      </main>

      <WorkoutTabBar />
    </div>
  );
}
