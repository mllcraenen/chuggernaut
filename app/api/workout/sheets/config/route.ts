import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { saveConfig, getStatus } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

// POST { credentials: <service account JSON string>, spreadsheetId: string }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const credentials = body?.credentials;
  const spreadsheetId = body?.spreadsheetId;
  if (typeof credentials !== "string" || credentials.trim() === "") {
    return NextResponse.json({ error: "credentials JSON is required" }, { status: 400 });
  }
  if (typeof spreadsheetId !== "string" || spreadsheetId.trim() === "") {
    return NextResponse.json({ error: "spreadsheetId is required" }, { status: 400 });
  }

  try {
    saveConfig(credentials, spreadsheetId);
  } catch {
    // Never echo the credentials back in the error.
    return NextResponse.json({ error: "Invalid service account JSON" }, { status: 400 });
  }

  // Status never includes the credentials themselves.
  return NextResponse.json(getStatus());
}
