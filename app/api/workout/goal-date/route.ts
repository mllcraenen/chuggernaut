import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getGoalDate, setGoalDate } from "@/lib/workout";
import { triggerExportIfDue } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ goalDate: getGoalDate() });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const date = body?.goalDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "goalDate must be YYYY-MM-DD" }, { status: 400 });
  }
  setGoalDate(date);
  triggerExportIfDue();
  return NextResponse.json({ goalDate: date });
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  setGoalDate("");
  triggerExportIfDue();
  return NextResponse.json({ ok: true });
}
