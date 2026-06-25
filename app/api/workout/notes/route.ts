import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getNotesForSession, setNote, deleteNote } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const week = Number(searchParams.get("week"));
  const day = Number(searchParams.get("day"));
  if (!Number.isInteger(week) || !Number.isInteger(day) || week < 1 || day < 1) {
    return NextResponse.json({ error: "Invalid week/day" }, { status: 400 });
  }

  const notes = getNotesForSession(week, day);
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).week !== "number" ||
    typeof (body as Record<string, unknown>).day !== "number" ||
    typeof (body as Record<string, unknown>).exercise !== "string" ||
    typeof (body as Record<string, unknown>).note !== "string"
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { week, day, exercise, note } = body as {
    week: number;
    day: number;
    exercise: string;
    note: string;
  };

  if (!Number.isInteger(week) || !Number.isInteger(day) || week < 1 || day < 1) {
    return NextResponse.json({ error: "Invalid week/day" }, { status: 400 });
  }
  if (!exercise.trim()) {
    return NextResponse.json({ error: "Exercise name required" }, { status: 400 });
  }

  setNote(week, day, exercise, note);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const week = Number(searchParams.get("week"));
  const day = Number(searchParams.get("day"));
  const exercise = searchParams.get("exercise") ?? "";

  if (!Number.isInteger(week) || !Number.isInteger(day) || week < 1 || day < 1) {
    return NextResponse.json({ error: "Invalid week/day" }, { status: 400 });
  }
  if (!exercise.trim()) {
    return NextResponse.json({ error: "Exercise name required" }, { status: 400 });
  }

  deleteNote(week, day, exercise);
  return NextResponse.json({ ok: true });
}
