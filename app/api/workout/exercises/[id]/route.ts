import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  getExerciseById,
  updateExercise,
  setExerciseArchived,
  setAlternatives,
  RenameBlockedError,
} from "@/lib/exercise-registry";
import { triggerExportIfDue } from "@/lib/workout-sheets";
import { toPayload, parseExerciseInput, parseAlternativeIds } from "../helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PATCH — either { archived: boolean } alone, or the full exercise shape
// { name, lift, role, loadMode, repMode, e1rmMode, alternativeIds? }.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  if (!getExerciseById(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  try {
    // Archive-only toggle: no other fields required.
    if (typeof body.archived === "boolean" && body.name === undefined) {
      const updated = setExerciseArchived(id, body.archived);
      triggerExportIfDue();
      return NextResponse.json(toPayload(updated));
    }

    const input = parseExerciseInput(body);
    if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

    let updated = updateExercise(id, input);
    const altIds = parseAlternativeIds(body);
    if (altIds !== null) setAlternatives(id, altIds);
    if (typeof body.archived === "boolean") updated = setExerciseArchived(id, body.archived);
    triggerExportIfDue();
    return NextResponse.json(toPayload(updated));
  } catch (e) {
    if (e instanceof RenameBlockedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : "could not update exercise";
    const status = msg.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
