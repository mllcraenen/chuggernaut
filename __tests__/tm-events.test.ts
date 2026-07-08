// Phase 4: TM provenance events + server-side autoregulation apply.
// Fresh temp DB per test (vi.resetModules so the module-level migration flag
// resets too). Program-agnostic: fixtures are derived from lib/workout-program.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "tm-events-test-"));
  process.env.WORKOUT_DB_PATH = join(tmpDir, "test.db");
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.WORKOUT_DB_PATH;
  vi.resetModules();
});

// A program day with a main-lift exercise whose sets carry %TM and RPE —
// required for autoregulation. Fails loudly if a future program drops them.
async function autoregFixture() {
  const { PROGRAM } = await import("../lib/workout-program");
  for (const d of PROGRAM) {
    const ex = d.exercises.find(
      (e) => e.lift !== null && e.sets.every((s) => s.percentOfTM != null && s.rpe != null)
    );
    if (ex) return { week: d.week, day: d.day, exercise: ex };
  }
  throw new Error("program has no main-lift exercise with %TM + RPE sets");
}

async function onboard() {
  const w = await import("../lib/workout");
  w.setTrainingMaxes(
    w.LIFTS.map((l) => ({ lift: l.id, e1rm: 180, trainingMax: 158.5 }))
  );
  return w;
}

// Log the fixture exercise's sets with a reported RPE `delta` above prescribed.
async function logFixtureSets(delta: number) {
  const { week, day, exercise } = await autoregFixture();
  const w = await import("../lib/workout");
  w.startSession(week, day);
  const tm = w.getTrainingMaxes()[exercise.lift!]!.trainingMax;
  for (const s of exercise.sets) {
    w.logSet({
      week,
      day,
      exercise: exercise.name,
      setNumber: s.setNumber,
      actualWeight: Math.round((tm * s.percentOfTM!) / 100),
      actualReps: s.reps,
      actualRpe: Math.min(10, s.rpe! + delta),
      prescribedRpe: s.rpe,
      prescribedReps: s.reps,
    });
  }
  return { week, day, lift: exercise.lift! };
}

describe("legacy migration", () => {
  it("backfills events from TM rows and the JSON auto-tag log", async () => {
    const { getDb } = await import("../lib/workout-db");
    const db = getDb();
    // Simulate a pre-Phase-4 DB: raw TM rows + the legacy JSON tag log.
    db.prepare(
      "INSERT INTO workout_training_maxes (lift, e1rm, training_max, set_at) VALUES (?,?,?,?)"
    ).run("squat", 180, 158.5, "2026-06-01T10:00:00Z");
    db.prepare(
      "INSERT INTO workout_training_maxes (lift, e1rm, training_max, set_at) VALUES (?,?,?,?)"
    ).run("squat", 182, 160, "2026-06-08T10:00:00Z");
    db.prepare("INSERT INTO workout_settings(key, value) VALUES (?,?)").run(
      "tm_autoregulation_log",
      JSON.stringify([{ lift: "squat", trainingMax: 160, setAt: "2026-06-08T10:00:00Z" }])
    );

    const { getTmEvents, getTmHistory } = await import("../lib/workout");
    const events = getTmEvents("squat");
    expect(events.length).toBe(2);
    expect(events[0].source).toBe("manual");
    expect(events[0].createdAt).toBe("2026-06-01T10:00:00Z");
    expect(events[1].source).toBe("auto");
    expect(events[1].tm).toBe(160);
    expect(events.every((e) => e.applied)).toBe(true);

    const history = getTmHistory("squat");
    expect(history.map((h) => h.reason)).toEqual(["Manual", "Auto"]);
  });

  it("does not duplicate events when setTrainingMaxes runs on a legacy DB", async () => {
    const { getDb } = await import("../lib/workout-db");
    getDb()
      .prepare(
        "INSERT INTO workout_training_maxes (lift, e1rm, training_max, set_at) VALUES (?,?,?,?)"
      )
      .run("bench", 100, 88, "2026-06-01T10:00:00Z");

    const { setTrainingMaxes, getTmEvents } = await import("../lib/workout");
    setTrainingMaxes([{ lift: "bench", e1rm: 105, trainingMax: 92.4 }]);
    const events = getTmEvents("bench");
    // 1 backfilled + 1 new — the new row must not be swept into the backfill.
    expect(events.length).toBe(2);
    expect(events[1].tm).toBe(92.4);
  });
});

describe("setTrainingMaxes provenance", () => {
  it("records an event per changed lift only", async () => {
    const w = await onboard(); // first save: one event per lift
    const before = w.getTmEvents().length;
    expect(before).toBe(w.LIFTS.length);

    // Re-save identical values → no new events.
    w.setTrainingMaxes(
      w.LIFTS.map((l) => ({ lift: l.id, e1rm: 180, trainingMax: 158.5 }))
    );
    expect(w.getTmEvents().length).toBe(before);

    // Change one lift → exactly one new manual event.
    w.setTrainingMaxes([{ lift: "squat", e1rm: 185, trainingMax: 163 }]);
    const events = w.getTmEvents();
    expect(events.length).toBe(before + 1);
    expect(events[events.length - 1]).toMatchObject({
      lift: "squat",
      tm: 163,
      source: "manual",
      applied: true,
    });
  });

  it("getTmProvenance returns the latest applied event per lift", async () => {
    const w = await onboard();
    w.setTrainingMaxes([{ lift: "deadlift", e1rm: 200, trainingMax: 176 }]);
    const prov = w.getTmProvenance();
    expect(prov.deadlift?.tm).toBe(176);
    expect(prov.squat?.tm).toBe(158.5);
  });
});

describe("server-side apply", () => {
  it("computes suggestions from logged RPE and applies idempotently", async () => {
    await onboard();
    const { week, day, lift } = await logFixtureSets(2); // felt much harder
    const areg = await import("../lib/autoregulation-db");
    const w = await import("../lib/workout");

    const suggestions = areg.computeAdjustmentsForSession(week, day);
    const s = suggestions.find((x) => x.lift === lift);
    expect(s).toBeDefined();
    expect(s!.suggestedTm).toBeLessThan(s!.currentTm); // harder → lower TM
    expect(s!.impliedTm).toBeGreaterThan(0);

    const applied = areg.applySessionAdjustments(week, day, [lift]);
    expect(applied.map((a) => a.lift)).toEqual([lift]);
    expect(w.getTrainingMaxes()[lift]!.trainingMax).toBe(s!.suggestedTm);

    const ev = w.getTmEvents(lift).at(-1)!;
    expect(ev).toMatchObject({
      source: "auto",
      applied: true,
      sourceWeek: week,
      sourceDay: day,
      setsUsed: s!.setsUsed,
      impliedTm: s!.impliedTm,
    });
    expect(ev.damping).not.toBeNull();

    // Second apply for the same session is a no-op (idempotency guard).
    const again = areg.applySessionAdjustments(week, day, [lift]);
    expect(again).toEqual([]);
    expect(w.getTrainingMaxes()[lift]!.trainingMax).toBe(s!.suggestedTm);
  });

  it("records suggestion events once, and not after an apply", async () => {
    await onboard();
    const { week, day, lift } = await logFixtureSets(2);
    const areg = await import("../lib/autoregulation-db");
    const w = await import("../lib/workout");

    const suggestions = areg.computeAdjustmentsForSession(week, day);
    areg.recordSuggestionEvents(week, day, suggestions);
    areg.recordSuggestionEvents(week, day, suggestions); // idempotent
    const suggestionEvents = w
      .getTmEvents(lift)
      .filter((e) => e.source === "suggestion");
    expect(suggestionEvents.length).toBe(1);
    expect(suggestionEvents[0].applied).toBe(false);

    // Suggestion events never move the TM (history shows applied only).
    const history = w.getTmHistory(lift);
    expect(history.every((h) => h.reason !== undefined)).toBe(true);
    expect(w.getTrainingMaxes()[lift]!.trainingMax).toBe(158.5);
  });

  it("maybeAutoApply honours the tm_auto_apply toggle", async () => {
    await onboard();
    const { week, day, lift } = await logFixtureSets(2);
    const areg = await import("../lib/autoregulation-db");
    const w = await import("../lib/workout");

    expect(areg.maybeAutoApply(week, day)).toBeNull(); // default off
    expect(w.getTmEvents(lift).filter((e) => e.source === "auto")).toEqual([]);

    w.setTmAutoApply(true);
    const applied = areg.maybeAutoApply(week, day);
    expect(applied).not.toBeNull();
    expect(applied!.map((a) => a.lift)).toContain(lift);
    expect(w.getTrainingMaxes()[lift]!.trainingMax).toBeLessThan(158.5);

    // Auto-apply is idempotent too.
    expect(areg.maybeAutoApply(week, day)).toEqual([]);
  });

  it("suggests nothing when reported RPE matches prescribed", async () => {
    await onboard();
    const { week, day } = await logFixtureSets(0);
    const areg = await import("../lib/autoregulation-db");
    expect(areg.computeAdjustmentsForSession(week, day)).toEqual([]);
  });
});
