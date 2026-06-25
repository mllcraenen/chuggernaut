import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getE1rmHistory, getCompletedSessions, LIFTS } from "@/lib/workout";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const e1rmHistory = Object.fromEntries(
    LIFTS.map((l) => [l.id, getE1rmHistory(l.id)])
  );
  const sessions = getCompletedSessions();

  return NextResponse.json({ e1rmHistory, sessions });
}
