export type Unit = "kg" | "lbs";

export const KG_TO_LBS = 2.20462;
export const LBS_TO_KG = 1 / KG_TO_LBS;

export const UNITS_KEY = "workout.units";

export function kgToDisplay(kg: number | null, unit: Unit): string {
  if (kg == null) return "—";
  if (unit === "lbs") return `${Math.round(kg * KG_TO_LBS)} lbs`;
  return `${kg} kg`;
}

export function displayToKg(value: number, unit: Unit): number {
  if (unit === "lbs") return Math.round(value * LBS_TO_KG * 10) / 10;
  return value;
}

export function unitLabel(unit: Unit): string {
  return unit === "lbs" ? "lbs" : "kg";
}
