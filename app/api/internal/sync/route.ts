import { NextRequest, NextResponse } from "next/server";
import { exportToSheet, importFromSheet, isConfigured } from "@/lib/workout-sheets";

export const dynamic = "force-dynamic";

// Internal-only sync endpoint — guarded by a secret header.
// Port 3003 is not exposed publicly (no Caddy proxy), so this is VPS-local only.
//
// Usage:
//   curl -s -H "X-Internal-Token: chuggernaut-internal" "http://localhost:3003/api/internal/sync?action=export"
//   curl -s -H "X-Internal-Token: chuggernaut-internal" "http://localhost:3003/api/internal/sync?action=import"
const INTERNAL_TOKEN = "chuggernaut-internal";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-internal-token") !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action");
  if (action !== "export" && action !== "import") {
    return NextResponse.json({ error: "action must be export or import" }, { status: 400 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: "Sheets sync is not configured" }, { status: 400 });
  }

  try {
    const result = action === "export" ? await exportToSheet() : await importFromSheet();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
