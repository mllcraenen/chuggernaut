import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { listSessions, startSession } from "@/lib/workout";
import { triggerExportIfDue } from "@/lib/workout-sheets";
import { PROGRAM_WEEKS as WEEKS, PROGRAM_DAYS as DAYS } from "@/lib/workout-program";

export const dynamic = "force-dynamic";

function validWeekDay(week: unknown, day: unknown): { week: number; day: number } | null {
  const w = Number(week);
  const d = Number(day);
  if (!Number.isInteger(w) || !Number.isInteger(d)) return null;
  if (w < 1 || w > WEEKS || d < 1 || d > DAYS) return null;
  return { week: w, day: d };
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listSessions());
}

// Body: { week, day } — starts (creates) a session.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const wd = validWeekDay(body?.week, body?.day);
  if (!wd) return NextResponse.json({ error: "invalid week/day" }, { status: 400 });

  const result = NextResponse.json(startSession(wd.week, wd.day), { status: 201 });
  triggerExportIfDue();
  return result;
}
