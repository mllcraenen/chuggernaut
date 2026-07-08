// Shared request-parsing/serialization for the exercises CRUD routes.
// Lives beside the route files (not in one of them — route modules may only
// export handlers).

import {
  getAlternativeIds,
  isExerciseReferenced,
  ROLES,
  LOAD_MODES,
  REP_MODES,
  E1RM_MODES,
  type ExerciseInput,
  type ExerciseDef,
} from "@/lib/exercise-registry";
import { isLiftId } from "@/lib/workout";

export interface ExercisePayload extends ExerciseDef {
  alternativeIds: number[];
  referenced: boolean; // rename is blocked while true
}

export function toPayload(e: ExerciseDef): ExercisePayload {
  return {
    ...e,
    alternativeIds: getAlternativeIds(e.id),
    referenced: isExerciseReferenced(e.name),
  };
}

// Returns the parsed input, or a human-readable error string.
export function parseExerciseInput(body: Record<string, unknown>): ExerciseInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "name is required";
  const lift = body.lift == null || body.lift === "" ? null : body.lift;
  if (lift !== null && !isLiftId(lift)) return "invalid lift";
  if (!ROLES.includes(body.role as never)) return "invalid role";
  if (!LOAD_MODES.includes(body.loadMode as never)) return "invalid loadMode";
  if (!REP_MODES.includes(body.repMode as never)) return "invalid repMode";
  if (!E1RM_MODES.includes(body.e1rmMode as never)) return "invalid e1rmMode";
  return {
    name,
    lift: lift as ExerciseInput["lift"],
    role: body.role as ExerciseInput["role"],
    loadMode: body.loadMode as ExerciseInput["loadMode"],
    repMode: body.repMode as ExerciseInput["repMode"],
    e1rmMode: body.e1rmMode as ExerciseInput["e1rmMode"],
  };
}

export function parseAlternativeIds(body: Record<string, unknown>): number[] | null {
  if (!Array.isArray(body.alternativeIds)) return null;
  return body.alternativeIds
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
}
