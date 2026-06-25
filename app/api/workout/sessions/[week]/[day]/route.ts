import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  completeSession,
  uncompleteSession,
  getSession,
  getSetsForSession,
  startSession,
} from "@/lib/workout";

export const dynamic = "force-dynamic";

const WEEKS = 16;
const DAYS = 4;

function parse(weekStr: string, dayStr: string): { week: number; day: number } | null {
  const week = Number(weekStr);
  const day = Number(dayStr);
  if (!Number.isInteger(week) || !Number.isInteger(day)) return null;
  if (week < 1 || week > WEEKS || day < 1 || day > DAYS) return null;
  return { week, day };
}

type Params = { params: Promise<{ week: string; day: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { week: w, day: d } = await params;
  const wd = parse(w, d);
  if (!wd) return NextResponse.json({ error: "invalid week/day" }, { status: 400 });

  return NextResponse.json({
    session: getSession(wd.week, wd.day),
    sets: getSetsForSession(wd.week, wd.day),
  });
}

// PATCH { action: "start" | "complete" }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { week: w, day: d } = await params;
  const wd = parse(w, d);
  if (!wd) return NextResponse.json({ error: "invalid week/day" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const action = body?.action ?? "complete";
  if (action === "start") {
    return NextResponse.json(startSession(wd.week, wd.day));
  }
  if (action === "complete") {
    return NextResponse.json(completeSession(wd.week, wd.day));
  }
  if (action === "uncomplete") {
    return NextResponse.json(uncompleteSession(wd.week, wd.day));
  }
  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
