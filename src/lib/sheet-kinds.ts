// What a connected sheet holds. Each kind has its own column roles; the
// dashboard and chat for a sheet are chosen by its kind. Pure: client-safe.

import { ROLES, detectColumns, isCompleteMapping } from "./orders";
import {
  WORKOUT_ROLES,
  detectWorkoutColumns,
  isCompleteWorkoutMapping,
  looksLikeWorkouts,
} from "./workouts";

export const SHEET_KINDS = ["orders", "fitness"] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** Role → header label. Which roles exist depends on the sheet's kind. */
export type SheetMapping = Partial<Record<string, string>>;

export type RoleDef = { label: string; required: boolean; hint: string };

export const KINDS: Record<
  SheetKind,
  {
    label: string;
    description: string;
    roles: Record<string, RoleDef>;
    detect: (headers: string[]) => SheetMapping;
    isComplete: (mapping: SheetMapping, headers: string[]) => boolean;
  }
> = {
  orders: {
    label: "Orders",
    description: "A business's orders: due dates, amounts, customers",
    roles: ROLES,
    detect: detectColumns,
    isComplete: isCompleteMapping,
  },
  fitness: {
    label: "Workouts",
    description: "A training log: dates, exercises, sets, reps and loads",
    roles: WORKOUT_ROLES,
    detect: detectWorkoutColumns,
    isComplete: isCompleteWorkoutMapping,
  },
};

export const isSheetKind = (v: unknown): v is SheetKind =>
  typeof v === "string" && (SHEET_KINDS as readonly string[]).includes(v);

/** A first guess at what a newly connected sheet holds, from its headers. */
export const detectKind = (headers: string[]): SheetKind =>
  looksLikeWorkouts(headers) ? "fitness" : "orders";

export const roleKeys = (kind: SheetKind) => Object.keys(KINDS[kind].roles);
