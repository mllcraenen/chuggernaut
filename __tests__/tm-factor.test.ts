import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
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
