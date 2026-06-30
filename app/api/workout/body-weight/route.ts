import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { logBodyWeight, getBodyWeightHistory, deleteBodyWeight } from "@/lib/workout";
import { triggerExportIfDue } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// GET → [{ date, weightKg }] ordered by date ASC
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getBodyWeightHistory());
}

// POST { date, weightKg } → { ok: true }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const weightKg = num(body.weightKg);

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  if (weightKg === null || weightKg <= 0) {
    return NextResponse.json({ error: "invalid weightKg" }, { status: 400 });
  }

  logBodyWeight(date, weightKg);
  triggerExportIfDue();
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE ?date= → { ok: true }
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date")?.trim() ?? "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const deleted = deleteBodyWeight(date);
  if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });
  triggerExportIfDue();
  return NextResponse.json({ ok: true });
}
