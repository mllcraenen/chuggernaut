import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { isLiftId, type LiftId } from "@/lib/workout";
import { PROGRAM_WEEKS, PROGRAM_DAYS } from "@/lib/workout-program";
import {
  applySessionAdjustments,
  computeAdjustmentsForSession,
  maybeAutoApply,
  recordSuggestionEvents,
} from "@/lib/autoregulation-db";
import { triggerExportIfDue } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Body: { week, day }            → TM suggestions for the session (records
//                                  suggestion events; auto-applies instead
//                                  when the tm_auto_apply setting is on).
// Body: { week, day, apply: [] } → apply the named lifts' suggestions,
//                                  recomputed server-side (client numbers are
//                                  never trusted), idempotent per lift/session.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const week = num(body?.week);
  const day = num(body?.day);
  if (
    week === null || day === null ||
    week < 1 || week > PROGRAM_WEEKS ||
    day < 1 || day > PROGRAM_DAYS
  ) {
    return NextResponse.json({ error: "invalid week/day" }, { status: 400 });
  }

  if (Array.isArray(body?.apply)) {
    const lifts = (body.apply as unknown[]).filter((l): l is LiftId => isLiftId(l));
    const applied = applySessionAdjustments(week, day, lifts);
    const res = NextResponse.json({ applied });
    triggerExportIfDue();
    return res;
  }

  const autoApplied = maybeAutoApply(week, day);
  if (autoApplied !== null) {
    const res = NextResponse.json({ suggestions: [], autoApplied });
    triggerExportIfDue();
    return res;
  }

  const suggestions = computeAdjustmentsForSession(week, day);
  recordSuggestionEvents(week, day, suggestions);
  const res = NextResponse.json({ suggestions });
  if (suggestions.length > 0) triggerExportIfDue();
  return res;
}
