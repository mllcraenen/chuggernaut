import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { listExercises, createExercise, setAlternatives } from "@/lib/exercise-registry";
import { triggerExportIfDue } from "@/lib/workout-sheets";
import { toPayload, parseExerciseInput, parseAlternativeIds } from "./helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    exercises: listExercises({ includeArchived: true }).map(toPayload),
  });
}

// POST { name, lift, role, loadMode, repMode, e1rmMode, alternativeIds? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const input = parseExerciseInput(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  try {
    const created = createExercise(input);
    const altIds = parseAlternativeIds(body);
    if (altIds && altIds.length > 0) setAlternatives(created.id, altIds);
    triggerExportIfDue();
    return NextResponse.json(toPayload(created), { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "could not create exercise";
    const status = msg.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
