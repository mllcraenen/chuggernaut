import Link from "next/link";
import {
  PROGRAM,
  PROGRAM_WEEKS,
  PROGRAM_DAYS,
  mainLifts,
  type ProgramDay,
} from "@/lib/workout-program";
import type { SessionRow } from "@/lib/workout";
import VolumeChart from "@/components/workout/volume-chart";

type CellStatus = "completed" | "active" | "upcoming";

function key(week: number, day: number): string {
  return `${week}-${day}`;
}

function buildStatusMap(sessions: SessionRow[]): Map<string, CellStatus> {
  const completed = new Set<string>();
  const started = new Set<string>();
  for (const s of sessions) {
    if (s.completedAt) completed.add(key(s.week, s.day));
    else if (s.startedAt) started.add(key(s.week, s.day));
  }

  const firstOpen = PROGRAM.find((d) => !completed.has(key(d.week, d.day)));
  const firstOpenKey = firstOpen ? key(firstOpen.week, firstOpen.day) : null;

  const map = new Map<string, CellStatus>();
  for (const d of PROGRAM) {
    const k = key(d.week, d.day);
    if (completed.has(k)) map.set(k, "completed");
    else if (started.has(k) || k === firstOpenKey) map.set(k, "active");
    else map.set(k, "upcoming");
  }
  return map;
}

function liftsLine(day: ProgramDay): string {
  return mainLifts(day).join(" · ");
}

function HeroCard({
  day,
  status,
  daysOut,
}: {
  day: ProgramDay;
  status: CellStatus;
  daysOut: { days: number; dateLabel: string } | null;
}) {
  const href = status === "active"
    ? `/workout/session/${day.week}/${day.day}`
    : `/workout/preview/${day.week}/${day.day}`;
  const ctaLabel = status === "completed" ? "Review" : status === "active" ? "Continue" : "Start";

  return (
    <div className="rounded-2xl border border-[#2a3352] bg-[#1e2740] overflow-hidden">
      {daysOut && (
        <div className="px-5 pt-4 pb-0">
          <p className="text-3xl font-black text-[#f5f5f5] leading-none">
            {daysOut.days > 0 ? `${daysOut.days} Days Out` : daysOut.days === 0 ? "Today!" : "Goal date passed"}
          </p>
          <p className="text-xs text-[#8e8e93] mt-0.5">{daysOut.dateLabel}</p>
        </div>
      )}
      <div className="px-5 pt-4 pb-4">
        <p className="text-xs font-semibold text-[#e84545] uppercase tracking-widest mb-1">
          {status === "completed" ? "Last completed" : "Next up"}
        </p>
        <div className="flex items-baseline gap-3">
          <span className="text-base text-[#8e8e93] font-semibold">Week {day.week}</span>
          <span className="text-5xl font-black text-[#f5f5f5] leading-none">Day {day.day}</span>
        </div>
        <p className="mt-2 text-sm text-[#8e8e93]">{day.label}</p>
        <p className="mt-0.5 text-xs text-[#8e8e93]/70">{liftsLine(day)}</p>
      </div>
      <div className="px-5 pb-5">
        <Link
          href={href}
          className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-[#e84545] text-white font-semibold text-base hover:bg-[#d33a3a] transition-colors"
        >
          {ctaLabel} session →
        </Link>
      </div>
    </div>
  );
}

function DayRow({ day, status }: { day: ProgramDay; status: CellStatus }) {
  const href = status === "active"
    ? `/workout/session/${day.week}/${day.day}`
    : `/workout/preview/${day.week}/${day.day}`;

  return (
    <Link href={href} className="flex items-center gap-4 px-4 py-3 hover:bg-[#242f4a] transition-colors">
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border ${
        status === "completed"
          ? "bg-[#30d158]/20 border-[#30d158] text-[#30d158]"
          : status === "active"
            ? "bg-[#e84545]/20 border-[#e84545] text-[#e84545]"
            : "bg-transparent border-[#2a3352] text-[#3d5080]"
      }`}>
        {status === "completed" ? "✓" : day.day}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${status === "upcoming" ? "text-[#8e8e93]" : "text-[#f5f5f5]"}`}>
            Day {day.day}
          </span>
          {status === "active" && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#e84545]">current</span>
          )}
        </div>
        <p className="text-xs text-[#8e8e93] truncate">{day.label} · {liftsLine(day)}</p>
      </div>

      <span className="text-[#3d5080] text-lg flex-shrink-0">›</span>
    </Link>
  );
}

export default function ProgramOverview({
  sessions,
  daysOut = null,
  weeklyVolume = [],
}: {
  sessions: SessionRow[];
  daysOut?: { days: number; dateLabel: string } | null;
  weeklyVolume?: { week: number; planned: number; actual: number }[];
}) {
  const statusMap = buildStatusMap(sessions);
  const weeks = Array.from({ length: PROGRAM_WEEKS }, (_, i) => i + 1);

  const activeDay = PROGRAM.find((d) => statusMap.get(key(d.week, d.day)) === "active");
  const heroDay = activeDay ?? PROGRAM[0];
  const heroStatus = statusMap.get(key(heroDay.week, heroDay.day)) ?? "upcoming";

  return (
    <div className="space-y-4">
      <HeroCard day={heroDay} status={heroStatus} daysOut={daysOut} />

      {/* Volume heatmap — always shown once onboarded (planned data fills all 16 weeks) */}
      {weeklyVolume.length > 0 && (
        <div className="rounded-xl border border-[#2a3352] bg-[#1e2740] px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-[#8e8e93] uppercase tracking-widest">Volume</p>
          <VolumeChart data={weeklyVolume} />
        </div>
      )}

      <div className="space-y-2">
        {weeks.map((week) => {
          const days = PROGRAM.filter((d) => d.week === week);
          const doneCount = days.filter((d) => statusMap.get(key(d.week, d.day)) === "completed").length;
          const isCurrentWeek = days.some((d) => statusMap.get(key(d.week, d.day)) === "active");
          const weekDone = doneCount === PROGRAM_DAYS;

          return (
            <section key={week} className="rounded-xl border border-[#2a3352] bg-[#1e2740] overflow-hidden">
              <div className={`flex items-center justify-between px-4 py-2.5 border-b border-[#2a3352] ${
                weekDone ? "bg-[#30d158]/5" : isCurrentWeek ? "bg-[#e84545]/5" : ""
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${
                    weekDone ? "text-[#30d158]" : isCurrentWeek ? "text-[#f5f5f5]" : "text-[#8e8e93]"
                  }`}>
                    Week {week}
                  </span>
                  {isCurrentWeek && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#e84545]">current</span>
                  )}
                  {weekDone && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#30d158]">done</span>
                  )}
                </div>
                <span className="text-xs text-[#8e8e93]">{doneCount} / {PROGRAM_DAYS}</span>
              </div>

              <div className="divide-y divide-[#2a3352]">
                {days.map((d) => (
                  <DayRow
                    key={d.day}
                    day={d}
                    status={statusMap.get(key(d.week, d.day)) ?? "upcoming"}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
