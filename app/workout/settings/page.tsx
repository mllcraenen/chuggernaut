import { auth } from "@/auth";
import { redirect } from "next/navigation";
import SettingsForm from "@/components/workout/settings-form";
import WorkoutTabBar from "@/components/workout/workout-tab-bar";
import UnitToggle from "@/components/workout/unit-toggle";
import { getTrainingMaxes, getGoalDate, getSetting, LIFTS } from "@/lib/workout";
import BarWeightSelector from "@/components/workout/bar-weight-selector";
import GoalDateForm from "@/components/workout/goal-date-form";
import SheetsSyncForm from "@/components/workout/sheets-sync-form";
import { getStatus, SETTING_SPREADSHEET_ID, importIfStale } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkoutSettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  await importIfStale();

  const tms = getTrainingMaxes();
  const goalDate = getGoalDate();
  const sheetsStatus = getStatus();
  const spreadsheetId = getSetting(SETTING_SPREADSHEET_ID) ?? "";
  const barWeight = Number(getSetting("bar_weight") ?? "20") || 20;

  return (
    <div className="min-h-screen bg-[#141b2d] text-[#f5f5f5]">
      <header className="sticky top-0 z-10 bg-[#141b2d] border-b border-[#2a3352] px-5 py-4 flex items-center justify-between">
        <span className="text-sm font-medium tracking-tight">Settings</span>
        <a
          href="/workout"
          className="text-xs text-[#8e8e93] hover:text-[#f5f5f5] transition-colors"
        >
          ← Chuggernaut
        </a>
      </header>

      <main className="max-w-md mx-auto w-full px-4 py-6 pb-24">
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold">Training Maxes</h1>
            <p className="mt-1 text-sm text-[#8e8e93]">
              Update your e1RM estimates. Training max is set to 90% automatically.
            </p>
          </div>

          <SettingsForm lifts={LIFTS} currentTms={tms} />

          <div>
            <h2 className="text-base font-semibold mb-3">Preferences</h2>
            <div className="space-y-3">
              <UnitToggle />
              <GoalDateForm current={goalDate} />
              <BarWeightSelector initial={barWeight} />
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold mb-3">Sync</h2>
            <SheetsSyncForm
              configured={sheetsStatus.configured}
              lastSync={sheetsStatus.lastSync}
              lastImport={sheetsStatus.lastImport}
              spreadsheetId={spreadsheetId}
            />
          </div>
        </div>
      </main>

      <WorkoutTabBar />
    </div>
  );
}
