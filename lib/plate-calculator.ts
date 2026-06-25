// Standard powerlifting plates available per side, largest first.
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export interface PlateResult {
  perSide: { weight: number; count: number }[];
  actualTotal: number;
  barKg: number;
  possible: boolean;
}

export function calculatePlates(targetKg: number, barKg = 20): PlateResult {
  if (targetKg < barKg) {
    return { perSide: [], actualTotal: barKg, barKg, possible: false };
  }

  let remaining = (targetKg - barKg) / 2;
  const perSide: { weight: number; count: number }[] = [];

  for (const plate of PLATES) {
    if (remaining < plate - 0.001) continue;
    // Small epsilon avoids floating-point floor errors (e.g. 1.25/1.25 = 0.9999...)
    const count = Math.floor(remaining / plate + 1e-9);
    if (count > 0) {
      perSide.push({ weight: plate, count });
      remaining = Math.round((remaining - plate * count) * 10000) / 10000;
    }
  }

  const loadedPerSide = perSide.reduce((sum, p) => sum + p.weight * p.count, 0);
  const actualTotal = Math.round((barKg + loadedPerSide * 2) * 10000) / 10000;
  const possible = Math.abs(actualTotal - targetKg) < 0.01;

  return { perSide, actualTotal, barKg, possible };
}
