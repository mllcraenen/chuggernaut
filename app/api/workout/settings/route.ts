import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/workout";
import { markDirty } from "@/lib/sheets-sync";
import { isSheetSyncedSettingKey } from "@/lib/sync-coverage";
import { triggerExportIfDue } from "@/lib/workout-sheets";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const value = getSetting(key);
  return NextResponse.json({ key, value });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.key !== "string" || typeof body.value !== "string") {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  setSetting(body.key, body.value);
  if (isSheetSyncedSettingKey(body.key)) {
    markDirty();
    triggerExportIfDue();
  }
  return NextResponse.json({ ok: true });
}
