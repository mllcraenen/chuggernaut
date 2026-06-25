import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { importFromSheet, isConfigured } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

// POST — read the configured Google Sheet and upsert rows into the DB tables.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isConfigured()) {
    return NextResponse.json({ error: "Sheets sync is not configured" }, { status: 400 });
  }

  try {
    const result = await importFromSheet();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
