import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { TM_FACTOR } from "@/lib/workout-program";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib"];
// The single allowed definition site.
const CANONICAL = join("lib", "workout-program.ts");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("TM_FACTOR is defined exactly once", () => {
  it("no file outside lib/workout-program.ts defines its own TM factor", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        if (file.endsWith(CANONICAL)) continue;
        const src = readFileSync(file, "utf8");
        // A numeric (re)definition, e.g. `const TM_FACTOR = 0.9`
        if (/TM_FACTOR\s*=\s*[\d.]/.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("canonical value is 0.88", () => {
    expect(TM_FACTOR).toBe(0.88);
  });
});

describe("getTmFactor (configurable via tm_factor setting)", () => {
  let testRoot: string;

  beforeAll(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "tm-factor-"));
    process.env.WORKOUT_DB_PATH = join(testRoot, "workout.db");
  });

  afterAll(async () => {
    await rm(testRoot, { recursive: true, force: true });
    delete process.env.WORKOUT_DB_PATH;
  });

  it("defaults to TM_FACTOR when unset, honours a valid setting, rejects garbage", async () => {
    const { getTmFactor, setSetting } = await import("@/lib/workout");
    const { getDb } = await import("@/lib/workout-db");
    getDb().exec("DELETE FROM workout_settings WHERE key = 'tm_factor'");

    expect(getTmFactor()).toBe(TM_FACTOR);

    setSetting("tm_factor", "0.9");
    expect(getTmFactor()).toBe(0.9);

    // Out of range or non-numeric falls back to the default.
    for (const bad of ["1.5", "0.2", "-1", "abc", ""]) {
      setSetting("tm_factor", bad);
      expect(getTmFactor(), `value ${JSON.stringify(bad)}`).toBe(TM_FACTOR);
    }
  });
});
