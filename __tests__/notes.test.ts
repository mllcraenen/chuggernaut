import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "notes-test-"));
  process.env.WORKOUT_DB_PATH = join(tmpDir, "test.db");
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.WORKOUT_DB_PATH;
  vi.resetModules();
});

// ----- Lib tests -----

describe("getNote / setNote round-trip", () => {
  it("returns null when no note exists", async () => {
    const { getNote } = await import("../lib/workout");
    expect(getNote(1, 1, "Competition Squat")).toBeNull();
  });

  it("saves and retrieves a note", async () => {
    const { getNote, setNote } = await import("../lib/workout");
    setNote(1, 1, "Competition Squat", "Keep bracing tight");
    expect(getNote(1, 1, "Competition Squat")).toBe("Keep bracing tight");
  });

  it("overwrites an existing note", async () => {
    const { getNote, setNote } = await import("../lib/workout");
    setNote(1, 1, "Competition Squat", "First note");
    setNote(1, 1, "Competition Squat", "Updated note");
    expect(getNote(1, 1, "Competition Squat")).toBe("Updated note");
  });

  it("is scoped by week, day, and exercise", async () => {
    const { getNote, setNote } = await import("../lib/workout");
    setNote(1, 1, "Competition Squat", "Squat note");
    setNote(1, 2, "Competition Squat", "Different day note");
    setNote(2, 1, "Competition Squat", "Different week note");
    expect(getNote(1, 1, "Competition Squat")).toBe("Squat note");
    expect(getNote(1, 2, "Competition Squat")).toBe("Different day note");
    expect(getNote(2, 1, "Competition Squat")).toBe("Different week note");
  });
});

describe("deleteNote", () => {
  it("removes the note", async () => {
    const { getNote, setNote, deleteNote } = await import("../lib/workout");
    setNote(1, 1, "Bench Press", "Pause at bottom");
    deleteNote(1, 1, "Bench Press");
    expect(getNote(1, 1, "Bench Press")).toBeNull();
  });

  it("is idempotent when note does not exist", async () => {
    const { deleteNote } = await import("../lib/workout");
    expect(() => deleteNote(1, 1, "Nonexistent")).not.toThrow();
  });
});

describe("getNotesForSession", () => {
  it("returns empty record when no notes exist", async () => {
    const { getNotesForSession } = await import("../lib/workout");
    expect(getNotesForSession(1, 1)).toEqual({});
  });

  it("returns all notes for the session keyed by exercise name", async () => {
    const { setNote, getNotesForSession } = await import("../lib/workout");
    setNote(1, 1, "Competition Squat", "Squat note");
    setNote(1, 1, "Paused Squat", "Paused note");
    setNote(1, 2, "Bench Press", "Other session — should not appear");
    const result = getNotesForSession(1, 1);
    expect(result).toEqual({
      "Competition Squat": "Squat note",
      "Paused Squat": "Paused note",
    });
    expect(result["Bench Press"]).toBeUndefined();
  });
});

// ----- API route tests -----

vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { name: "test" } }),
}));

describe("GET /api/workout/notes", () => {
  it("returns notes for the session", async () => {
    const { setNote } = await import("../lib/workout");
    setNote(1, 1, "Competition Squat", "API note");

    const { GET } = await import("../app/api/workout/notes/route");
    const req = new NextRequest("http://localhost/api/workout/notes?week=1&day=1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes["Competition Squat"]).toBe("API note");
  });

  it("returns 400 for invalid week", async () => {
    const { GET } = await import("../app/api/workout/notes/route");
    const req = new NextRequest("http://localhost/api/workout/notes?week=abc&day=1");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/workout/notes", () => {
  it("saves a note and GET retrieves it", async () => {
    const { POST, GET } = await import("../app/api/workout/notes/route");

    const postReq = new NextRequest("http://localhost/api/workout/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: 2, day: 3, exercise: "Deadlift", note: "Drive floor away" }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);
    expect((await postRes.json()).ok).toBe(true);

    const getReq = new NextRequest("http://localhost/api/workout/notes?week=2&day=3");
    const getRes = await GET(getReq);
    expect((await getRes.json()).notes["Deadlift"]).toBe("Drive floor away");
  });

  it("returns 400 for missing fields", async () => {
    const { POST } = await import("../app/api/workout/notes/route");
    const req = new NextRequest("http://localhost/api/workout/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: 1, day: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/workout/notes", () => {
  it("removes a note", async () => {
    const { setNote } = await import("../lib/workout");
    setNote(3, 1, "Overhead Press", "Tight core");

    const { DELETE, GET } = await import("../app/api/workout/notes/route");
    const delReq = new NextRequest(
      "http://localhost/api/workout/notes?week=3&day=1&exercise=Overhead+Press",
      { method: "DELETE" }
    );
    const delRes = await DELETE(delReq);
    expect(delRes.status).toBe(200);

    const getRes = await GET(
      new NextRequest("http://localhost/api/workout/notes?week=3&day=1")
    );
    const body = await getRes.json();
    expect(body.notes["Overhead Press"]).toBeUndefined();
  });
});

describe("auth enforcement", () => {
  it("returns 401 for unauthenticated GET", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { GET } = await import("../app/api/workout/notes/route");
    const res = await GET(new NextRequest("http://localhost/api/workout/notes?week=1&day=1"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for unauthenticated POST", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { POST } = await import("../app/api/workout/notes/route");
    const res = await POST(
      new NextRequest("http://localhost/api/workout/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: 1, day: 1, exercise: "Squat", note: "test" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for unauthenticated DELETE", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { DELETE } = await import("../app/api/workout/notes/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/workout/notes?week=1&day=1&exercise=Squat", {
        method: "DELETE",
      })
    );
    expect(res.status).toBe(401);
  });
});
