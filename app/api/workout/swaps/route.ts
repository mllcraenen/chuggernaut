import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { createSwap, clearSwap } from "@/lib/workout";
import { triggerExportIfDue } from "@/lib/workout-sheets";
import { blockEndWeek, getAlternatives } from "@/lib/exercise-alternatives";

export const dynamic = "force-dynamic";

// POST { originalExercise, replacementExercise, scope: "day"|"block", week, day }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { originalExercise, replacementExercise, scope, week, day } = body;
  if (!originalExercise || !replacementExercise || !scope || !week || !day) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (scope !== "day" && scope !== "block") {
    return NextResponse.json({ error: "scope must be 'day' or 'block'" }, { status: 400 });
  }

  const endWeek = scope === "block" ? blockEndWeek(week) : null;
  const swap = createSwap(originalExercise, replacementExercise, scope, week, day, endWeek);
  triggerExportIfDue();
  return NextResponse.json(swap, { status: 201 });
}

// DELETE ?originalExercise=&week=&day=
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const originalExercise = searchParams.get("originalExercise") ?? "";
  const week = Number(searchParams.get("week"));
  const day = Number(searchParams.get("day"));

  if (!originalExercise || !week || !day) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  clearSwap(originalExercise, week, day);
  triggerExportIfDue();
  return NextResponse.json({ ok: true });
}

// GET /api/workout/swaps?exercise=
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const exercise = new URL(req.url).searchParams.get("exercise") ?? "";
  return NextResponse.json({ alternatives: getAlternatives(exercise) });
}
