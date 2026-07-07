import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { triggerExportIfDue } from "@/lib/workout-sheets";
import {
  LIFTS,
  getTmFactor,
  getTrainingMaxes,
  isOnboarded,
  setTrainingMaxes,
  appendTmAutoLog,
  isLiftId,
  type TrainingMaxInput,
  type LiftId,
} from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    onboarded: isOnboarded(),
    trainingMaxes: getTrainingMaxes(),
    tmFactor: getTmFactor(),
  });
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Body: { maxes: [{ lift, e1rm, trainingMax? }] }
// If trainingMax is omitted it is derived as e1rm * getTmFactor().
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rawList = body?.maxes;
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return NextResponse.json({ error: "maxes array is required" }, { status: 400 });
  }

  const entries: TrainingMaxInput[] = [];
  for (const item of rawList) {
    if (!item || !isLiftId(item.lift)) {
      return NextResponse.json({ error: `invalid lift: ${item?.lift}` }, { status: 400 });
    }
    const e1rm = num(item.e1rm);
    if (e1rm === null || e1rm <= 0) {
      return NextResponse.json(
        { error: `invalid e1rm for ${item.lift}` },
        { status: 400 }
      );
    }
    const tmRaw = num(item.trainingMax);
    const trainingMax = tmRaw !== null && tmRaw > 0
      ? tmRaw
      : Math.round(e1rm * getTmFactor() * 10) / 10;
    entries.push({ lift: item.lift, e1rm, trainingMax });
  }

  // Require all four lifts so onboarding is complete in one shot.
  const provided = new Set(entries.map((e) => e.lift));
  const missing = LIFTS.filter((l) => !provided.has(l.id)).map((l) => l.id);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `missing lifts: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const setAt = setTrainingMaxes(entries);

  // Tag any autoregulation-sourced lifts so settings can label them "Auto".
  const autoRaw = body?.autoLifts;
  if (Array.isArray(autoRaw)) {
    const autoLifts = new Set(autoRaw.filter((l): l is LiftId => isLiftId(l)));
    const tags = entries
      .filter((e) => autoLifts.has(e.lift))
      .map((e) => ({ lift: e.lift, trainingMax: e.trainingMax, setAt }));
    appendTmAutoLog(tags);
  }

  const result = NextResponse.json(
    { onboarded: isOnboarded(), trainingMaxes: getTrainingMaxes() },
    { status: 201 }
  );
  triggerExportIfDue();
  return result;
}
