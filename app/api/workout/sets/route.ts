import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { logSet, deleteSet, type LogSetInput } from "@/lib/workout";

export const dynamic = "force-dynamic";

const WEEKS = 16;
const DAYS = 4;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function optNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  return num(v);
}

// Body: { week, day, exercise, setNumber, actualWeight, actualReps,
//         actualRpe?, prescribedWeight?, prescribedReps?, prescribedRpe? }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const week = num(body.week);
  const day = num(body.day);
  const setNumber = num(body.setNumber);
  const actualWeight = num(body.actualWeight);
  const actualReps = num(body.actualReps);
  const exercise = typeof body.exercise === "string" ? body.exercise.trim() : "";

  if (week === null || day === null || week < 1 || week > WEEKS || day < 1 || day > DAYS) {
    return NextResponse.json({ error: "invalid week/day" }, { status: 400 });
  }
  if (!exercise) {
    return NextResponse.json({ error: "exercise is required" }, { status: 400 });
  }
  if (setNumber === null || setNumber < 1) {
    return NextResponse.json({ error: "invalid setNumber" }, { status: 400 });
  }
  if (actualWeight === null || actualWeight < 0) {
    return NextResponse.json({ error: "invalid actualWeight" }, { status: 400 });
  }
  if (actualReps === null || actualReps < 1) {
    return NextResponse.json({ error: "invalid actualReps" }, { status: 400 });
  }

  const input: LogSetInput = {
    week,
    day,
    exercise,
    setNumber,
    actualWeight,
    actualReps,
    actualRpe: optNum(body.actualRpe),
    prescribedWeight: optNum(body.prescribedWeight),
    prescribedReps: optNum(body.prescribedReps),
    prescribedRpe: optNum(body.prescribedRpe),
  };

  return NextResponse.json(logSet(input), { status: 201 });
}

// DELETE ?week=&day=&exercise=&setNumber=
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const week = num(searchParams.get("week"));
  const day = num(searchParams.get("day"));
  const setNumber = num(searchParams.get("setNumber"));
  const exercise = searchParams.get("exercise")?.trim() ?? "";

  if (week === null || day === null || week < 1 || week > WEEKS || day < 1 || day > DAYS) {
    return NextResponse.json({ error: "invalid week/day" }, { status: 400 });
  }
  if (!exercise) return NextResponse.json({ error: "exercise required" }, { status: 400 });
  if (setNumber === null || setNumber < 1) return NextResponse.json({ error: "invalid setNumber" }, { status: 400 });

  const deleted = deleteSet(week, day, exercise, setNumber);
  if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
