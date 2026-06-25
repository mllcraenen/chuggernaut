import { auth } from "@/auth";
import { readFile } from "fs/promises";
import { join, normalize, resolve } from "path";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const logsRoot = resolve(process.env.LOG_ROOT ?? "/home/admin/logs");
  const requestedPath = resolve(join(logsRoot, ...path));

  // Path traversal guard
  if (!requestedPath.startsWith(logsRoot)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!requestedPath.endsWith(".log")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const content = await readFile(requestedPath, "utf-8");
    return new NextResponse(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
