// Turns raw merged sheet rows into workout entries. Pure: runs on server and client.

import type { CellValue } from "./google/sheets";
import { parseDate } from "./orders";

export const WORKOUT_ROLES = {
  date: { label: "Date", required: true, hint: "Day of the session" },
  exercise: { label: "Exercise", required: true, hint: "What you did, e.g. Lat Pulldowns" },
  sets: { label: "Sets", required: false, hint: "Number of sets" },
  reps: { label: "Reps", required: false, hint: "Reps per set, e.g. 10 or 10-12" },
  load: { label: "Load / weight", required: false, hint: "e.g. 20 kg, Stack 5, Bodyweight" },
  muscle: { label: "Target muscle", required: false, hint: "Muscles the exercise works" },
  block: { label: "Routine / day", required: false, hint: "e.g. Push Block P1, Leg day" },
  notes: { label: "Notes", required: false, hint: "Shown with each session" },
  bodyWeight: { label: "Body weight", required: false, hint: "Your weight that day (kg)" },
} as const;

export type WorkoutRole = keyof typeof WORKOUT_ROLES;
export const WORKOUT_ROLE_KEYS = Object.keys(WORKOUT_ROLES) as WorkoutRole[];

/** Role → header label as written in the sheet. */
export type WorkoutMapping = Partial<Record<WorkoutRole, string>>;

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Legs",
  "Core",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * What was lifted. Kilograms and cable-stack levels are kept apart: progress
 * is only ever compared within one unit. `low`/`high` differ for "6 kg / 8 kg"
 * or "Stack 7-8".
 */
export type Load =
  | { unit: "kg"; low: number; high: number }
  | { unit: "stack"; low: number; high: number }
  | { unit: "bodyweight" }
  | { unit: "other" };

export type WorkoutEntry = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** As written, minus a trailing "/ Back Block B1" style label. */
  exercise: string;
  /** Lower-cased `exercise`, for grouping the same exercise across sessions. */
  exerciseKey: string;
  muscle: string | null;
  muscleGroups: MuscleGroup[];
  sets: number | null;
  reps: { low: number; high: number } | null;
  load: Load | null;
  /** The load cell as written, for display when it isn't a clean number. */
  loadText: string | null;
  block: string | null;
  /** "Push Block P1" → "Push". */
  dayType: string | null;
  notes: string | null;
  tab: string;
};

export type BodyWeightEntry = { date: string; kg: number; tab: string };

export type WorkoutParseResult = {
  entries: WorkoutEntry[];
  bodyWeights: BodyWeightEntry[];
  skipped: { noDate: number; noExercise: number };
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// Detection

const PATTERNS: Record<WorkoutRole, RegExp[]> = {
  date: [/\bdate\b/, /\bday\b/, /\bwhen\b/],
  bodyWeight: [/\bbody ?weight\b/, /\bbw\b/, /\bweigh[ -]?in\b/],
  sets: [/\bsets?\b/],
  reps: [/\breps?\b/, /\brepetitions?\b/],
  load: [/\bload\b/, /\bweight\b/, /\bkgs?\b/, /\bsetting\b/, /\bresistance\b/],
  muscle: [/\bmuscles?\b/, /\bbody ?part\b/, /\btarget\b/],
  block: [/\broutine\b/, /\bblock\b/, /\bsplit\b/, /\bworkout\b/, /\bsession\b/],
  exercise: [/\bexercises?\b/, /\bmovement\b/, /\blift\b/, /\bname\b/],
  notes: [/\bnotes?\b/, /\bcomments?\b/],
};

/**
 * Best guess for each role from the header names. Each header is used at most
 * once; body weight is matched before load so "Body weight" isn't the load.
 */
export function detectWorkoutColumns(headers: string[]): WorkoutMapping {
  const mapping: WorkoutMapping = {};
  const used = new Set<string>();
  const order: WorkoutRole[] = [
    "date",
    "bodyWeight",
    "sets",
    "reps",
    "exercise",
    "load",
    "muscle",
    "block",
    "notes",
  ];
  for (const role of order) {
    for (const pattern of PATTERNS[role]) {
      const hit = headers.find((h) => !used.has(h) && pattern.test(norm(h)));
      if (hit) {
        mapping[role] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return mapping;
}

/** Headers that look like a workout log: an exercise column plus sets, reps or load. */
export function looksLikeWorkouts(headers: string[]) {
  const m = detectWorkoutColumns(headers);
  return Boolean(m.exercise && (m.sets || m.reps || m.load));
}

// ---------------------------------------------------------------------------
// Value parsing

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const LB_TO_KG = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;

const text = (v: CellValue | undefined) => {
  const s = String(v ?? "").trim();
  return s && !/^[—–-]+$/.test(s) ? s : null;
};

/** "4" or 4 → 4; "3x10" → 3; "—" or blank → null. */
export function parseSets(v: CellValue | undefined): number | null {
  const n =
    typeof v === "number"
      ? v
      : Number(
          String(v ?? "")
            .trim()
            .match(/^(\d+)(?:\s*[x×]\s*\d+)?$/i)?.[1] ?? NaN,
        );
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : null;
}

/** 10 → 10–10; "10-12" → 10–12; "3x10" → 10–10; "12, 10, 8" → 8–12; "—" → null. */
export function parseReps(v: CellValue | undefined): { low: number; high: number } | null {
  if (typeof v === "number") return v > 0 && v <= 1000 ? { low: v, high: v } : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  s = s.replace(/^\d+\s*[x×]\s*/i, ""); // "3x10": the reps are after the x
  const nums = [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (!nums.length || !/^[\d\s,/–\-to]+$/i.test(s)) return null;
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  return low > 0 && high <= 1000 ? { low, high } : null;
}

/**
 * The load cell → a comparable load.
 * "Bodyweight"/"BW" → bodyweight; "Stack 5", "Stack 7-8" → stack levels;
 * "6 kg DBs", "6 kg / 8 kg DBs", "20", "45 lb" → kilograms; anything else
 * (e.g. "Light Stack") is kept as text only.
 */
export function parseLoad(v: CellValue | undefined): Load | null {
  if (typeof v === "number") return v > 0 ? { unit: "kg", low: v, high: v } : null;
  const raw = text(v);
  if (!raw) return null;
  const s = norm(raw);

  if (/^(bw|body ?weight)\b/.test(s)) return { unit: "bodyweight" };

  const stack = s.match(
    new RegExp(String.raw`\b(?:stack|level|pin|plate)\s*(${NUMBER})(?:\s*[-–/]\s*(${NUMBER}))?`),
  );
  if (stack) {
    const [a, b = a] = [Number(stack[1]), Number(stack[2] ?? stack[1])];
    return { unit: "stack", low: Math.min(a, b), high: Math.max(a, b) };
  }

  const amounts = [...s.matchAll(new RegExp(String.raw`(${NUMBER})\s*(kgs?|lbs?)?`, "g"))];
  const hasUnit = amounts.some((m) => m[2]);
  const bareNumbers = /^[\d.\s/–-]+$/.test(s);
  if (amounts.length && (hasUnit || bareNumbers)) {
    // "6/8 kg": a number without a unit takes the unit written elsewhere.
    const lb = amounts.some((m) => m[2]?.startsWith("lb")) && !amounts.some((m) => m[2]?.startsWith("kg"));
    const kg = amounts.map((m) => Number(m[1]) * (lb ? LB_TO_KG : 1)).filter((n) => n > 0);
    if (kg.length) return { unit: "kg", low: round1(Math.min(...kg)), high: round1(Math.max(...kg)) };
  }
  return { unit: "other" };
}

/** 82.5, "82.5 kg", "182 lb" → kilograms; anything else → null. */
export function parseBodyWeight(v: CellValue | undefined): number | null {
  const load = parseLoad(v);
  if (load?.unit !== "kg") return null;
  const kg = load.low;
  return kg >= 20 && kg <= 400 ? kg : null;
}

/** "Seated Cable Rows / Back Block B1" → "Seated Cable Rows". Other names unchanged. */
export function cleanExerciseName(name: string) {
  return name.replace(/\s*\/\s*[^/]*\bblock\b[^/]*$/i, "").trim() || name.trim();
}

/** "Push Block P1" → "Push"; "Leg Day 2" → "Leg Day"; "Upper" → "Upper". */
export function dayTypeOf(block: string): string | null {
  const before = block.split(/\bblock\b/i)[0];
  const s = before.replace(/\s+([A-Z]?\d+[A-Z]?)$/i, "").trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const GROUP_WORDS: [MuscleGroup, RegExp][] = [
  ["Chest", /\b(chest|pecs?|pectorals?)\b/],
  ["Back", /\b(back|lats?|rhomboids?|traps?|trapezius)\b/],
  ["Shoulders", /\b(delts?|deltoids?|shoulders?)\b/],
  ["Biceps", /\b(biceps?|brachialis)\b/],
  ["Triceps", /\btriceps?\b/],
  ["Forearms", /\b(forearms?|wrists?|grip|brachioradialis)\b/],
  ["Legs", /\b(legs?|quads?|quadriceps|hamstrings?|glutes?|calf|calves|adductors?|abductors?)\b/],
  ["Core", /\b(core|abs|abdominals?|obliques?)\b/],
];

/** "Upper Chest & Front Deltoids" → [Chest, Shoulders]. "Lower back" counts as Back. */
export function muscleGroupsOf(muscle: string): MuscleGroup[] {
  const s = norm(muscle);
  return GROUP_WORDS.filter(([, re]) => re.test(s)).map(([g]) => g);
}

// ---------------------------------------------------------------------------

/**
 * Applies a mapping to merged rows. A row needs a date and an exercise to be
 * an exercise entry; a row with a date and body weight also (or only) gives a
 * body-weight reading.
 */
export function parseWorkouts(
  headers: string[],
  rows: { tab: string; values: CellValue[] }[],
  mapping: WorkoutMapping,
): WorkoutParseResult {
  const col = Object.fromEntries(
    WORKOUT_ROLE_KEYS.map((r) => [r, mapping[r] ? headers.indexOf(mapping[r]) : -1]),
  ) as Record<WorkoutRole, number>;
  const at = (values: CellValue[], role: WorkoutRole) =>
    col[role] === -1 ? undefined : values[col[role]];

  const entries: WorkoutEntry[] = [];
  const bodyWeights: BodyWeightEntry[] = [];
  const skipped = { noDate: 0, noExercise: 0 };

  for (const { tab, values } of rows) {
    const date = parseDate(at(values, "date") ?? "");
    if (!date) {
      skipped.noDate += 1;
      continue;
    }
    const kg = parseBodyWeight(at(values, "bodyWeight"));
    if (kg !== null) bodyWeights.push({ date, kg, tab });

    const name = text(at(values, "exercise"));
    if (!name) {
      if (kg === null) skipped.noExercise += 1;
      continue;
    }
    const exercise = cleanExerciseName(name);
    const muscle = text(at(values, "muscle"));
    const block = text(at(values, "block"));
    const setsCell = at(values, "sets");
    const repsCell = at(values, "reps");
    entries.push({
      date,
      exercise,
      exerciseKey: norm(exercise),
      muscle,
      muscleGroups: muscle ? muscleGroupsOf(muscle) : [],
      // "3x10" written in the reps column still gives the sets.
      sets:
        parseSets(setsCell) ??
        (!text(setsCell) && /^\s*\d+\s*[x×]\s*\d+\s*$/i.test(String(repsCell ?? ""))
          ? parseSets(repsCell)
          : null),
      reps: parseReps(repsCell),
      load: parseLoad(at(values, "load")),
      loadText: text(at(values, "load")),
      block,
      dayType: block ? dayTypeOf(block) : null,
      notes: text(at(values, "notes")),
      tab,
    });
  }
  return { entries, bodyWeights, skipped };
}

/** True if the mapping names every required role, using columns that exist. */
export function isCompleteWorkoutMapping(mapping: WorkoutMapping, headers: string[]) {
  return WORKOUT_ROLE_KEYS.every((role) => {
    const h = mapping[role];
    if (!h) return !WORKOUT_ROLES[role].required;
    return headers.includes(h);
  });
}

// ---------------------------------------------------------------------------
// Display

const range = (low: number, high: number) => (low === high ? `${low}` : `${low}–${high}`);

/** "6–8 kg", "Stack 5", "Bodyweight", or the cell as written. */
export function formatLoad(load: Load | null, written: string | null) {
  if (!load) return written ?? "—";
  switch (load.unit) {
    case "kg":
      return `${range(load.low, load.high)} kg`;
    case "stack":
      return `Stack ${range(load.low, load.high)}`;
    case "bodyweight":
      return "Bodyweight";
    default:
      return written ?? "—";
  }
}

export const formatReps = (reps: { low: number; high: number } | null) =>
  reps ? range(reps.low, reps.high) : "—";
