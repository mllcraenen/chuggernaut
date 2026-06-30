import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  getSetsForSession,
  getTrainingMaxes,
  getSwapsForSession,
} from "@/lib/workout";
import { getProgramDay } from "@/lib/workout-program";
import {
  computeSessionAdjustments,
  type AutoregSet,
} from "@/lib/autoregulation";

export const dynamic = "force-dynamic";

const WEEKS = 16;
const DAYS = 4;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Body: { week, day }. Returns TM adjustment suggestions for the session's
// main lifts based on prescribed-vs-actual RPE. Pure read — applies nothing.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const week = num(body?.week);
  const day = num(body?.day);
  if (week === null || day === null || week < 1 || week > WEEKS || day < 1 || day > DAYS) {
    return NextResponse.json({ error: "invalid week/day" }, { status: 400 });
  }

  const programDay = getProgramDay(week, day);
  if (!programDay) {
    return NextResponse.json({ suggestions: [] });
  }

  // Map each prescribed set (under its effective, possibly-swapped name) to the
  // lift and %TM it was programmed at, so logged rows can be enriched.
  const swapMap = getSwapsForSession(week, day);
  const prescribedByKey = new Map<
    string,
    { lift: AutoregSet["lift"]; percentOfTM: number | null }
  >();
  for (const ex of programDay.exercises) {
    const effectiveName = swapMap[ex.name] ?? ex.name;
    for (const set of ex.sets) {
      prescribedByKey.set(`${effectiveName}#${set.setNumber}`, {
        lift: ex.lift,
        percentOfTM: set.percentOfTM,
      });
    }
  }

  const loggedSets = getSetsForSession(week, day);
  const inputs: AutoregSet[] = loggedSets
    .filter((s) => s.loggedAt)
    .map((s) => {
      const prescribed = prescribedByKey.get(`${s.exercise}#${s.setNumber}`);
      return {
        lift: prescribed?.lift ?? null,
        setNumber: s.setNumber,
        prescribedPercent: prescribed?.percentOfTM ?? null,
        prescribedRpe: s.prescribedRpe,
        actualWeight: s.actualWeight,
        actualReps: s.actualReps,
        actualRpe: s.actualRpe,
      };
    });

  const suggestions = computeSessionAdjustments(inputs, getTrainingMaxes());
  return NextResponse.json({ suggestions });
}
