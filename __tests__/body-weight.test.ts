import { describe, it, expect, beforeEach, vi } from "vitest";

// Point the workout DB at a throwaway temp file BEFORE lib/workout-db loads
// (it reads WORKOUT_DB_PATH at module-eval time). vi.hoisted runs first.
vi.hoisted(() => {
  const os = require("os");
  const path = require("path");
  const fs = require("fs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-test-"));
  process.env.WORKOUT_DB_PATH = path.join(dir, "workout.db");
});

// Mock auth so we can toggle the session per test.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { getDb } from "../lib/workout-db";
import { logBodyWeight, getBodyWeightHistory, deleteBodyWeight } from "../lib/workout";
import { GET, POST, DELETE } from "../app/api/workout/body-weight/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

function signedIn() {
  mockAuth.mockResolvedValue({ user: { name: "test" } });
}
function signedOut() {
  mockAuth.mockResolvedValue(null);
}

beforeEach(() => {
  getDb().exec("DELETE FROM workout_body_weight");
  mockAuth.mockReset();
  signedIn();
});

// ─── lib round-trip ────────────────────────────────────────────────────────────

describe("logBodyWeight / getBodyWeightHistory", () => {
  it("round-trips a single entry", () => {
    logBodyWeight("2026-06-25", 82.5);
    const hist = getBodyWeightHistory();
    expect(hist).toEqual([{ date: "2026-06-25", weightKg: 82.5 }]);
  });

  it("returns entries ordered by date ascending", () => {
    logBodyWeight("2026-06-25", 82.5);
    logBodyWeight("2026-06-20", 83.1);
    logBodyWeight("2026-06-23", 82.8);
    expect(getBodyWeightHistory().map((p) => p.date)).toEqual([
      "2026-06-20",
      "2026-06-23",
      "2026-06-25",
    ]);
  });

  it("upserts on duplicate date (UNIQUE constraint)", () => {
    logBodyWeight("2026-06-25", 82.5);
    logBodyWeight("2026-06-25", 81.0);
    const hist = getBodyWeightHistory();
    expect(hist).toHaveLength(1);
    expect(hist[0].weightKg).toBe(81.0);
  });

  it("deleteBodyWeight removes the row and reports success", () => {
    logBodyWeight("2026-06-25", 82.5);
    expect(deleteBodyWeight("2026-06-25")).toBe(true);
    expect(getBodyWeightHistory()).toHaveLength(0);
  });

  it("deleteBodyWeight returns false for a missing date", () => {
    expect(deleteBodyWeight("2099-01-01")).toBe(false);
  });
});

// ─── API routes ─────────────────────────────────────────────────────────────

function postReq(body: unknown) {
  return new Request("http://localhost/api/workout/body-weight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
function delReq(date: string) {
  return new Request(
    `http://localhost/api/workout/body-weight?date=${encodeURIComponent(date)}`,
    { method: "DELETE" }
  ) as never;
}

describe("body-weight API", () => {
  it("POST then GET returns the saved entry", async () => {
    const post = await POST(postReq({ date: "2026-06-25", weightKg: 82.5 }));
    expect(post.status).toBe(201);

    const get = await GET();
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data).toEqual([{ date: "2026-06-25", weightKg: 82.5 }]);
  });

  it("POST rejects an invalid date", async () => {
    const res = await POST(postReq({ date: "25-06-2026", weightKg: 82.5 }));
    expect(res.status).toBe(400);
  });

  it("POST rejects a non-positive weight", async () => {
    const res = await POST(postReq({ date: "2026-06-25", weightKg: 0 }));
    expect(res.status).toBe(400);
  });

  it("DELETE removes an entry", async () => {
    await POST(postReq({ date: "2026-06-25", weightKg: 82.5 }));
    const del = await DELETE(delReq("2026-06-25"));
    expect(del.status).toBe(200);
    expect(getBodyWeightHistory()).toHaveLength(0);
  });

  it("DELETE returns 404 for a missing entry", async () => {
    const res = await DELETE(delReq("2099-01-01"));
    expect(res.status).toBe(404);
  });
});

// ─── Auth enforcement ────────────────────────────────────────────────────────

describe("body-weight API auth", () => {
  it("GET returns 401 when unauthenticated", async () => {
    signedOut();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when unauthenticated", async () => {
    signedOut();
    const res = await POST(postReq({ date: "2026-06-25", weightKg: 82.5 }));
    expect(res.status).toBe(401);
  });

  it("DELETE returns 401 when unauthenticated", async () => {
    signedOut();
    const res = await DELETE(delReq("2026-06-25"));
    expect(res.status).toBe(401);
  });
});
