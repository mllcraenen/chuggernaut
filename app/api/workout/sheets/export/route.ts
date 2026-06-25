import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { exportToSheet, isConfigured } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

// POST — read all DB tables and write them to the configured Google Sheet.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isConfigured()) {
    return NextResponse.json({ error: "Sheets sync is not configured" }, { status: 400 });
  }

  try {
    const result = await exportToSheet();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
