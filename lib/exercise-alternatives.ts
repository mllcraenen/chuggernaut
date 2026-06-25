// Recommended swap alternatives per exercise.
// Grouped by the movement pattern / muscle focus.
export const ALTERNATIVES: Record<string, string[]> = {
  // Primary squat movements
  "Competition Squat": ["High Bar Squat", "Front Squat", "Belt Squat", "Paused Squat", "Leg Press"],
  "Paused Squat":      ["Competition Squat", "High Bar Squat", "Front Squat", "Belt Squat", "Goblet Squat"],
  "High Bar Squat":    ["Competition Squat", "Front Squat", "Belt Squat", "Paused Squat"],
  "Front Squat":       ["Competition Squat", "High Bar Squat", "Goblet Squat", "Safety Bar Squat"],

  // Primary bench movements
  "Competition Bench": ["Close-Grip Bench", "Incline Bench", "DB Bench Press", "Larsen Press", "Paused Bench"],
  "Close-Grip Bench":  ["Competition Bench", "Incline Bench", "DB Bench Press", "Skull Crushers"],
  "Incline Bench":     ["Competition Bench", "DB Incline Press", "Close-Grip Bench"],

  // Primary deadlift movements
  "Competition Deadlift": ["Trap Bar Deadlift", "Sumo Deadlift", "Romanian Deadlift", "Rack Pull", "Deficit Deadlift"],
  "Deficit Deadlift":     ["Competition Deadlift", "Romanian Deadlift", "Stiff-Leg Deadlift", "Trap Bar Deadlift"],
  "Trap Bar Deadlift":    ["Competition Deadlift", "Romanian Deadlift", "Rack Pull"],

  // OHP
  "Overhead Press":    ["Seated DB Press", "Push Press", "Z-Press", "DB Lateral Raise"],
  "Seated DB Press":   ["Overhead Press", "Push Press", "Arnold Press"],

  // Accessories — quad
  "Leg Press":         ["Hack Squat", "Belt Squat", "Goblet Squat", "Bulgarian Split Squat", "Leg Extensions"],
  "Leg Extensions":    ["Leg Press", "Hack Squat", "Step-Ups", "Goblet Squat"],
  "Bulgarian Split Squat": ["Leg Press", "Step-Ups", "Goblet Squat", "Leg Extensions"],

  // Accessories — hamstring / hinge
  "Romanian Deadlift": ["Good Morning", "Stiff-Leg Deadlift", "Nordic Curl", "Leg Curl"],
  "Leg Curl":          ["Romanian Deadlift", "Nordic Curl", "Good Morning", "Stiff-Leg Deadlift"],
  "Good Morning":      ["Romanian Deadlift", "Stiff-Leg Deadlift", "Hyperextension"],

  // Accessories — pull / back
  "Pull-ups":          ["Lat Pulldown", "Cable Row", "Assisted Pull-ups", "Chin-ups"],
  "Chin-ups":          ["Pull-ups", "Lat Pulldown", "Cable Row"],
  "Barbell Row":       ["DB Row", "Cable Row", "Chest-Supported Row", "Pendlay Row"],
  "Chest-Supported Row": ["Barbell Row", "DB Row", "Cable Row", "T-Bar Row"],
  "DB Row":            ["Barbell Row", "Cable Row", "Chest-Supported Row"],

  // Accessories — push / triceps / shoulders
  "Triceps Pushdown":  ["Skull Crushers", "Overhead Tricep Extension", "Diamond Push-ups", "Tricep Extension"],
  "Tricep Extension":  ["Triceps Pushdown", "Skull Crushers", "Close-Grip Bench", "Overhead Tricep Extension"],
  "Lateral Raise":     ["Cable Lateral Raise", "DB Lateral Raise", "Machine Lateral Raise"],
  "Rear Delt Fly":     ["Face Pull", "Cable Rear Delt Fly", "Band Pull-Apart"],
  "Face Pull":         ["Rear Delt Fly", "Band Pull-Apart", "Cable Rear Delt Fly"],

  // Accessories — arms
  "Bicep Curl":        ["Hammer Curl", "Incline DB Curl", "Cable Curl", "EZ-Bar Curl"],

  // Core
  "Ab Work":           ["Plank", "Cable Crunch", "Hanging Leg Raise", "Ab Wheel", "Dead Bug"],
};

export function getAlternatives(exercise: string): string[] {
  return ALTERNATIVES[exercise] ?? [];
}

// Which block (1–4) does a given week belong to?
export function blockOf(week: number): number {
  return Math.ceil(week / 4);
}

// Last week of the block containing `week`
export function blockEndWeek(week: number): number {
  return blockOf(week) * 4;
}
