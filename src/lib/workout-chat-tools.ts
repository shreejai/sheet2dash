// Computations the chat model calls as tools on a workout sheet, so every
// number it quotes is calculated here rather than guessed. Pure.

import { WEEKDAYS, monthLabel, shortDate, startOfWeek, weekdayIndex, type DateRange } from "./dates";
import { formatDate } from "./format";
import { bodyWeightTrend, exerciseProgress } from "./workout-metrics";
import {
  MUSCLE_GROUPS,
  formatLoad,
  formatReps,
  type BodyWeightEntry,
  type MuscleGroup,
  type WorkoutEntry,
} from "./workouts";

export type WorkoutFilter = {
  from?: string;
  to?: string;
  /** Part of an exercise name, case-insensitive. */
  exercise?: string;
  muscleGroup?: MuscleGroup;
  /** Part of the routine/day type, e.g. "push". */
  dayType?: string;
};

export const WORKOUT_GROUP_BY = [
  "none",
  "month",
  "week",
  "weekday",
  "exercise",
  "muscleGroup",
  "dayType",
] as const;
export type WorkoutGroupBy = (typeof WORKOUT_GROUP_BY)[number];

export const WORKOUT_SORT_BY = ["sets", "sessions", "chronological"] as const;
export type WorkoutSortBy = (typeof WORKOUT_SORT_BY)[number];

export { MUSCLE_GROUPS };

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();
const day = (iso: string) => `${WEEKDAYS[weekdayIndex(iso)]} ${formatDate(iso)}`;

function matches(e: WorkoutEntry, f: WorkoutFilter) {
  if (f.from && e.date < f.from) return false;
  if (f.to && e.date > f.to) return false;
  if (f.exercise && !lower(e.exercise).includes(lower(f.exercise))) return false;
  if (f.muscleGroup && !e.muscleGroups.includes(f.muscleGroup)) return false;
  if (f.dayType && !lower(e.dayType ?? e.block).includes(lower(f.dayType))) return false;
  return true;
}

type Totals = { sessions: Set<string>; sets: number; exercises: Set<string>; logged: number };
const empty = (): Totals => ({ sessions: new Set(), sets: 0, exercises: new Set(), logged: 0 });
const add = (t: Totals, e: WorkoutEntry) => {
  t.sessions.add(e.date);
  t.sets += e.sets ?? 0;
  t.exercises.add(e.exerciseKey);
  t.logged += 1;
};
const summarise = (t: Totals) => ({
  sessions: t.sessions.size,
  sets: t.sets,
  differentExercises: t.exercises.size,
  exerciseRowsLogged: t.logged,
  setsPerSession: t.sessions.size ? Math.round((t.sets / t.sessions.size) * 10) / 10 : null,
});

const pct = (now: number, before: number) =>
  before === 0
    ? null
    : `${now >= before ? "+" : "−"}${Math.round((Math.abs(now - before) / before) * 100)}%`;

function groupKeys(e: WorkoutEntry, by: WorkoutGroupBy): { key: string; label: string }[] {
  switch (by) {
    case "none":
      return [{ key: "all", label: "All matching workouts" }];
    case "month":
      return [{ key: e.date.slice(0, 7), label: monthLabel(e.date) }];
    case "week": {
      const monday = startOfWeek(e.date);
      return [{ key: monday, label: `Week of ${shortDate(monday, true)}` }];
    }
    case "weekday": {
      const i = weekdayIndex(e.date);
      return [{ key: String(i), label: WEEKDAYS[i] }];
    }
    case "exercise":
      return [{ key: e.exerciseKey, label: e.exercise }];
    case "muscleGroup":
      // An exercise that works two groups counts towards both.
      return (e.muscleGroups.length ? e.muscleGroups : ["Other"]).map((g) => ({ key: g, label: g }));
    case "dayType":
      return [{ key: lower(e.dayType) || "(none)", label: e.dayType ?? "(no routine)" }];
  }
}

/**
 * Sessions, sets and exercises matching a filter, optionally grouped and
 * compared with another date range. A session is a day with anything logged.
 */
export function summariseTraining(
  entries: WorkoutEntry[],
  input: {
    filter: WorkoutFilter;
    groupBy: WorkoutGroupBy;
    sortBy: WorkoutSortBy;
    limit: number;
    compareTo?: DateRange;
  },
) {
  const matched = entries.filter((e) => matches(e, input.filter));
  const total = empty();
  for (const e of matched) add(total, e);
  const result: Record<string, unknown> = { total: summarise(total) };

  if (input.compareTo) {
    const before = empty();
    for (const e of entries) if (matches(e, { ...input.filter, ...input.compareTo })) add(before, e);
    result.comparison = {
      period: `${formatDate(input.compareTo.from)} – ${formatDate(input.compareTo.to)}`,
      ...summarise(before),
      sessionsChange: pct(total.sessions.size, before.sessions.size),
      setsChange: pct(total.sets, before.sets),
    };
  }

  if (input.groupBy !== "none") {
    const groups = new Map<string, Totals & { label: string }>();
    for (const e of matched) {
      for (const { key, label } of groupKeys(e, input.groupBy)) {
        const g = groups.get(key) ?? { ...empty(), label };
        add(g, e);
        groups.set(key, g);
      }
    }
    const rows = [...groups.entries()].sort(([ka, a], [kb, b]) =>
      input.sortBy === "chronological"
        ? ka.localeCompare(kb)
        : input.sortBy === "sessions"
          ? b.sessions.size - a.sessions.size || b.sets - a.sets
          : b.sets - a.sets || b.sessions.size - a.sessions.size,
    );
    result.groupCount = rows.length;
    result.groups = rows.slice(0, input.limit).map(([, g]) => ({ group: g.label, ...summarise(g) }));
  }
  return result;
}

const describe = (e: WorkoutEntry) => ({
  exercise: e.exercise,
  sets: e.sets,
  reps: e.reps ? formatReps(e.reps) : null,
  load: e.loadText ? formatLoad(e.load, e.loadText) : null,
  targetMuscle: e.muscle,
  notes: e.notes,
});

/**
 * Every session of the exercises whose name contains `exercise`, oldest
 * first, with first/latest/best load and the change. Loads are only compared
 * within one unit (kg or cable-stack level).
 */
export function exerciseHistory(
  entries: WorkoutEntry[],
  input: { exercise: string; from?: string; to?: string; limit: number },
) {
  const matched = entries.filter((e) => matches(e, input));
  const progress = exerciseProgress(matched);
  if (!progress.length) {
    const names = [...new Set(entries.map((e) => e.exercise))].sort();
    return { matchingExercises: 0, knownExercises: names.slice(0, 60) };
  }
  return {
    matchingExercises: progress.length,
    exercises: progress.slice(0, 5).map((p) => {
      const sessions = matched
        .filter((e) => e.exerciseKey === p.key)
        .sort((a, b) => a.date.localeCompare(b.date));
      const unit = p.latest.load?.unit;
      const best = p.history.reduce<{ date: string; top: number } | null>(
        (b, h) => (!b || h.top > b.top ? h : b),
        null,
      );
      const fmt = (n: number) => (unit === "stack" ? `stack ${n}` : `${n} kg`);
      return {
        exercise: p.name,
        sessions: p.sessions,
        first: { date: day(p.first.date), load: formatLoad(p.first.load, null), reps: formatReps(p.first.reps) },
        latest: { date: day(p.latest.date), load: formatLoad(p.latest.load, null), reps: formatReps(p.latest.reps) },
        bestLoad: best ? { date: day(best.date), load: fmt(best.top) } : null,
        loadChange:
          p.change === null
            ? "not comparable (one session, bodyweight, or loads in different units)"
            : `${p.change > 0 ? "+" : p.change < 0 ? "−" : ""}${Math.abs(p.change)} ${unit === "stack" ? "stack level(s)" : "kg"}`,
        history: sessions.slice(-input.limit).map((e) => ({ date: day(e.date), ...describe(e) })),
      };
    }),
  };
}

/** Whole sessions (every exercise logged that day), for "what did I do on…" questions. */
export function listSessions(
  entries: WorkoutEntry[],
  input: { filter: WorkoutFilter; newestFirst: boolean; limit: number },
) {
  const byDay = new Map<string, WorkoutEntry[]>();
  for (const e of entries.filter((e) => matches(e, input.filter))) {
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  }
  const days = [...byDay.keys()].sort((a, b) => (input.newestFirst ? b.localeCompare(a) : a.localeCompare(b)));
  return {
    matchingSessions: days.length,
    shown: Math.min(days.length, input.limit),
    sessions: days.slice(0, input.limit).map((d) => {
      // A session's full workout, not just the rows that matched an exercise filter.
      const all = entries.filter((e) => e.date === d);
      return {
        date: day(d),
        dayTypes: [...new Set(all.map((e) => e.dayType).filter(Boolean))],
        totalSets: all.reduce((n, e) => n + (e.sets ?? 0), 0),
        exercises: all.map(describe),
      };
    }),
  };
}

/** Body-weight readings in a range, with the latest and the change. */
export function bodyWeightReadings(readings: BodyWeightEntry[], range: DateRange) {
  const trend = bodyWeightTrend(readings, range);
  return {
    readings: trend.points.length,
    latest: trend.latest === null ? null : `${trend.latest} kg on ${day(trend.points.at(-1)!.date)}`,
    first: trend.points[0] ? `${trend.points[0].kg} kg on ${day(trend.points[0].date)}` : null,
    change:
      trend.change === null ? null : `${trend.change > 0 ? "+" : trend.change < 0 ? "−" : ""}${Math.abs(trend.change)} kg`,
    lowest: trend.points.length ? `${Math.min(...trend.points.map((p) => p.kg))} kg` : null,
    highest: trend.points.length ? `${Math.max(...trend.points.map((p) => p.kg))} kg` : null,
    recent: trend.points.slice(-10).map((p) => ({ date: day(p.date), kg: p.kg })),
  };
}
