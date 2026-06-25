import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getStatus } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

// GET — { configured, lastSync, error? }. Never returns the credentials.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = getStatus();
  return NextResponse.json({ ...status, error: null });
}
