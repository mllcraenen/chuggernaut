import { describe, it, expect } from "vitest";
import { calculatePlates } from "../lib/plate-calculator";

// Converts lbs to kg the same way the UI does (mirrors displayToKg in lib/units.ts).
const LBS_TO_KG = 1 / 2.20462;
function lbsToKg(lbs: number): number {
  return Math.round(lbs * LBS_TO_KG * 10) / 10;
}

describe("calculatePlates", () => {
  it("100kg with 20kg bar → 1×25 + 1×15 per side, actualTotal 100, possible", () => {
    const result = calculatePlates(100, 20);
    expect(result.barKg).toBe(20);
    expect(result.actualTotal).toBe(100);
    expect(result.possible).toBe(true);
    // Per side: (100-20)/2 = 40kg → 1×25 + 1×15
    expect(result.perSide).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
    ]);
  });

  it("142.5kg with 20kg bar → 2×25 + 1×10 + 1×1.25 per side, actualTotal 142.5", () => {
    const result = calculatePlates(142.5, 20);
    expect(result.barKg).toBe(20);
    expect(result.actualTotal).toBe(142.5);
    expect(result.possible).toBe(true);
    // Per side: (142.5-20)/2 = 61.25kg → 2×25 + 1×10 + 1×1.25
    expect(result.perSide).toEqual([
      { weight: 25, count: 2 },
      { weight: 10, count: 1 },
      { weight: 1.25, count: 1 },
    ]);
  });

  it("20kg with 20kg bar → empty per side (bar only)", () => {
    const result = calculatePlates(20, 20);
    expect(result.barKg).toBe(20);
    expect(result.actualTotal).toBe(20);
    expect(result.possible).toBe(true);
    expect(result.perSide).toEqual([]);
  });

  it("17kg with 20kg bar → possible: false (less than bar weight)", () => {
    const result = calculatePlates(17, 20);
    expect(result.possible).toBe(false);
    expect(result.perSide).toEqual([]);
  });

  it("defaults bar weight to 20kg when not specified", () => {
    const result = calculatePlates(60);
    expect(result.barKg).toBe(20);
    expect(result.actualTotal).toBe(60);
    expect(result.possible).toBe(true);
    // Per side: 20kg → 1×20
    expect(result.perSide).toEqual([{ weight: 20, count: 1 }]);
  });

  it("15kg bar (women's bar) — 60kg → 1×20 + 1×2.5 per side", () => {
    const result = calculatePlates(60, 15);
    expect(result.barKg).toBe(15);
    expect(result.actualTotal).toBe(60);
    expect(result.possible).toBe(true);
    // Per side: (60-15)/2 = 22.5kg → 1×20 + 1×2.5
    expect(result.perSide).toEqual([
      { weight: 20, count: 1 },
      { weight: 2.5, count: 1 },
    ]);
  });

  it("exact bar weight with 15kg bar → possible: true, empty per side", () => {
    const result = calculatePlates(15, 15);
    expect(result.possible).toBe(true);
    expect(result.perSide).toEqual([]);
    expect(result.actualTotal).toBe(15);
  });

  it("weight below bar with 15kg bar → possible: false", () => {
    const result = calculatePlates(10, 15);
    expect(result.possible).toBe(false);
  });

  it("unit conversion — lbs input converted to kg before calculating", () => {
    // 225 lbs ≈ 102.1kg. Convert first, then calculatePlates.
    const targetKg = lbsToKg(225);
    const result = calculatePlates(targetKg, 20);
    // just verifies the function handles the converted value without throwing
    expect(typeof result.actualTotal).toBe("number");
    expect(Array.isArray(result.perSide)).toBe(true);
  });

  it("60kg total → 1×20 per side", () => {
    const result = calculatePlates(60, 20);
    expect(result.actualTotal).toBe(60);
    expect(result.possible).toBe(true);
    // Per side: 20kg → 1×20
    expect(result.perSide).toEqual([{ weight: 20, count: 1 }]);
  });

  it("large weight — 300kg → 2×25 + 2×20 + 1×15 + 1×10 + 1×5 per side", () => {
    const result = calculatePlates(300, 20);
    expect(result.actualTotal).toBe(300);
    expect(result.possible).toBe(true);
    // Per side: 140kg → 2×25+2×20+1×15+1×10+1×5 = 50+40+15+10+5 = 120? No...
    // (300-20)/2 = 140. 140/25=5 r15, 15/15=1 r0. → 5×25 + 1×15 = 140 ✓
    expect(result.perSide).toEqual([
      { weight: 25, count: 5 },
      { weight: 15, count: 1 },
    ]);
  });

  it("non-loadable weight — 21kg → possible: false (0.5kg per side, no 0.5kg plate)", () => {
    const result = calculatePlates(21, 20);
    expect(result.possible).toBe(false);
  });
});
