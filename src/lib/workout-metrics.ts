// Workout dashboard numbers, computed from parsed entries. Pure: runs on server and client.

import {
  addDays,
  addMonths,
  daysBetween,
  inRange,
  monthLabel,
  shortDate,
  startOfMonth,
  startOfWeek,
  type DateRange,
} from "./dates";
import {
  MUSCLE_GROUPS,
  type BodyWeightEntry,
  type Load,
  type MuscleGroup,
  type WorkoutEntry,
} from "./workouts";

export const entriesIn = (entries: WorkoutEntry[], range: DateRange) =>
  entries.filter((e) => inRange(e.date, range));

const sumSets = (entries: WorkoutEntry[]) => entries.reduce((n, e) => n + (e.sets ?? 0), 0);
const distinct = <T>(items: T[]) => new Set(items).size;

// ---------------------------------------------------------------------------
// Key numbers

export type FitnessKpis = {
  sessions: number;
  sets: number;
  exercises: number;
  setsPerSession: number | null;
};

/** A session is a day with at least one exercise logged. */
export function computeFitnessKpis(entries: WorkoutEntry[], range: DateRange): FitnessKpis {
  const inPeriod = entriesIn(entries, range);
  const sessions = distinct(inPeriod.map((e) => e.date));
  const sets = sumSets(inPeriod);
  return {
    sessions,
    sets,
    exercises: distinct(inPeriod.map((e) => e.exerciseKey)),
    setsPerSession: sessions ? sets / sessions : null,
  };
}

// ---------------------------------------------------------------------------
// Volume over time

export type VolumePoint = { label: string; start: string; sets: number; sessions: number };
export type Volume = { bucket: "week" | "month"; points: VolumePoint[] };

/** Sets and sessions per week (up to ~3 months) or per month. Weeks start Monday. */
export function volumeTrend(entries: WorkoutEntry[], range: DateRange): Volume {
  const bucket = daysBetween(range.from, range.to) <= 92 ? "week" : "month";
  const startOf = (iso: string) => (bucket === "week" ? startOfWeek(iso) : startOfMonth(iso));
  const next = (iso: string) => (bucket === "week" ? addDays(iso, 7) : addMonths(iso, 1));

  const points: VolumePoint[] = [];
  const index = new Map<string, number>();
  for (let start = startOf(range.from); start <= range.to; start = next(start)) {
    index.set(start, points.length);
    points.push({
      start,
      label:
        bucket === "week" ? shortDate(start < range.from ? range.from : start) : monthLabel(start),
      sets: 0,
      sessions: 0,
    });
  }

  const days = new Set<string>();
  for (const e of entriesIn(entries, range)) {
    const point = points[index.get(startOf(e.date))!];
    point.sets += e.sets ?? 0;
    if (!days.has(e.date)) {
      days.add(e.date);
      point.sessions += 1;
    }
  }
  return { bucket, points };
}

// ---------------------------------------------------------------------------
// Muscle groups

export const OTHER_MUSCLE = "Other";
export type MuscleRow = { name: MuscleGroup | typeof OTHER_MUSCLE; sets: number; exercises: number };

/**
 * Sets per muscle group. An exercise that works two groups ("Upper Chest &
 * Front Deltoids") counts its sets towards both. Muscles that don't match a
 * group are folded into "Other", always last.
 */
export function setsByMuscle(entries: WorkoutEntry[]): MuscleRow[] {
  const groups = new Map<MuscleRow["name"], MuscleRow>();
  for (const e of entries) {
    if (!e.muscle) continue;
    const names: MuscleRow["name"][] = e.muscleGroups.length ? e.muscleGroups : [OTHER_MUSCLE];
    for (const name of names) {
      const g = groups.get(name) ?? { name, sets: 0, exercises: 0 };
      g.sets += e.sets ?? 0;
      g.exercises += 1;
      groups.set(name, g);
    }
  }
  const other = groups.get(OTHER_MUSCLE);
  groups.delete(OTHER_MUSCLE);
  const ranked = [...groups.values()].sort((a, b) => b.sets - a.sets || b.exercises - a.exercises);
  return other ? [...ranked, other] : ranked;
}

// ---------------------------------------------------------------------------
// Training days

export type TrainingDay = {
  date: string;
  /** Exercises logged that day (0 = rest day). */
  exercises: number;
  sets: number;
  dayTypes: string[];
  future: boolean;
};
export type TrainingWeek = { start: string; days: TrainingDay[]; sessions: number };

/** The last `weeks` weeks (Monday to Sunday, this week last), day by day. */
export function trainingCalendar(
  entries: WorkoutEntry[],
  today: string,
  weeks: number,
): TrainingWeek[] {
  const byDay = new Map<string, WorkoutEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const first = addDays(startOfWeek(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => {
    const start = addDays(first, w * 7);
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, d);
      const list = byDay.get(date) ?? [];
      return {
        date,
        exercises: list.length,
        sets: sumSets(list),
        dayTypes: [...new Set(list.map((e) => e.dayType).filter((t): t is string => !!t))],
        future: date > today,
      };
    });
    return { start, days, sessions: days.filter((d) => d.exercises > 0).length };
  });
}

// ---------------------------------------------------------------------------
// Exercise progress

export type ProgressPoint = { date: string; load: Load | null; reps: WorkoutEntry["reps"] };
export type ExerciseProgress = {
  name: string;
  key: string;
  sessions: number;
  first: ProgressPoint;
  latest: ProgressPoint;
  /**
   * Latest top load minus the first, when both are in the same unit (kg or
   * stack level); null when they can't be compared.
   */
  change: number | null;
  /** Every session's load in the latest load's unit, oldest first, for a chart. */
  history: { date: string; top: number }[];
};

const topOf = (load: Load | null) =>
  load && (load.unit === "kg" || load.unit === "stack") ? load.high : null;

/**
 * Each exercise's first and latest session, most recently trained first.
 * Within one day the last row in the sheet counts as that day's load.
 */
export function exerciseProgress(entries: WorkoutEntry[]): ExerciseProgress[] {
  const groups = new Map<string, WorkoutEntry[]>();
  for (const e of entries) groups.set(e.exerciseKey, [...(groups.get(e.exerciseKey) ?? []), e]);

  const rows: ExerciseProgress[] = [];
  for (const [key, list] of groups) {
    // Stable sort keeps sheet order within a day.
    const sorted = list.map((e, i) => ({ e, i })).sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i);
    const byDate = new Map<string, WorkoutEntry>();
    for (const { e } of sorted) byDate.set(e.date, e);
    const sessions = [...byDate.values()];
    const first = sessions[0];
    const latest = sessions[sessions.length - 1];
    const unit = latest.load?.unit;
    const comparable = (l: Load | null) => topOf(l) !== null && l!.unit === unit;

    const firstTop = topOf(first.load);
    const latestTop = topOf(latest.load);
    rows.push({
      name: latest.exercise,
      key,
      sessions: sessions.length,
      first: { date: first.date, load: first.load, reps: first.reps },
      latest: { date: latest.date, load: latest.load, reps: latest.reps },
      change:
        sessions.length > 1 && firstTop !== null && latestTop !== null && first.load!.unit === unit
          ? latestTop - firstTop
          : null,
      history: sessions
        .filter((e) => comparable(e.load))
        .map((e) => ({ date: e.date, top: topOf(e.load)! })),
    });
  }
  return rows.sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Sessions

export type Session = {
  date: string;
  dayTypes: string[];
  sets: number;
  entries: WorkoutEntry[];
};

/** The most recent sessions, newest first, each with its exercises in sheet order. */
export function recentSessions(entries: WorkoutEntry[], count: number): Session[] {
  const byDay = new Map<string, WorkoutEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, count)
    .map(([date, list]) => ({
      date,
      dayTypes: [...new Set(list.map((e) => e.dayType).filter((t): t is string => !!t))],
      sets: sumSets(list),
      entries: list,
    }));
}

// ---------------------------------------------------------------------------
// Body weight

export type BodyWeightTrend = {
  points: { date: string; kg: number }[];
  latest: number | null;
  /** Latest minus the first reading in the period, or null with fewer than two. */
  change: number | null;
};

/** One reading per day (the last one written), in date order. */
export function bodyWeightTrend(readings: BodyWeightEntry[], range: DateRange): BodyWeightTrend {
  const byDay = new Map<string, number>();
  for (const r of readings) if (inRange(r.date, range)) byDay.set(r.date, r.kg);
  const points = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kg]) => ({ date, kg }));
  const latest = points.at(-1)?.kg ?? null;
  return {
    points,
    latest,
    change: points.length > 1 ? Math.round((latest! - points[0].kg) * 10) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Muscle recovery

export type RecoveryRow = {
  group: MuscleGroup;
  status: "ready" | "recovering" | "untrained";
  /** The last day the group was trained, on or before today. */
  lastTrained: string | null;
  daysAgo: number | null;
  /** Sets that day for the group, and the exercises that worked it. */
  sets: number;
  exercises: string[];
  /** First day it counts as ready again, while recovering. */
  readyOn: string | null;
};

/**
 * Each muscle group's state today. A group trained within the last
 * `windowDays` calendar days (today counts as day 0) is recovering; trained
 * earlier, it's ready. Sheets hold dates, not times, so a 2-day window means
 * "trained today or yesterday". Ready groups come first (longest rested
 * first), then recovering (soonest ready first), then groups never logged.
 */
export function muscleRecovery(
  entries: WorkoutEntry[],
  today: string,
  windowDays: number,
): RecoveryRow[] {
  const rows = MUSCLE_GROUPS.map((group): RecoveryRow => {
    const worked = entries.filter((e) => e.date <= today && e.muscleGroups.includes(group));
    const last = worked.reduce<string | null>((d, e) => (!d || e.date > d ? e.date : d), null);
    if (!last) {
      return { group, status: "untrained", lastTrained: null, daysAgo: null, sets: 0, exercises: [], readyOn: null };
    }
    const thatDay = worked.filter((e) => e.date === last);
    const daysAgo = daysBetween(last, today);
    const recovering = daysAgo < windowDays;
    return {
      group,
      status: recovering ? "recovering" : "ready",
      lastTrained: last,
      daysAgo,
      sets: sumSets(thatDay),
      exercises: [...new Set(thatDay.map((e) => e.exercise))],
      readyOn: recovering ? addDays(last, windowDays) : null,
    };
  });
  const rank = { ready: 0, recovering: 1, untrained: 2 } as const;
  return rows.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.status === "ready" ? b.daysAgo! - a.daysAgo! : 0) ||
      (a.status === "recovering" ? a.readyOn!.localeCompare(b.readyOn!) : 0),
  );
}
