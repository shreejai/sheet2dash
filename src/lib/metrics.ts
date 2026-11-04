// Dashboard numbers, computed from parsed orders. Pure: runs on server and client.

import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  endOfYear,
  inRange,
  monthLabel,
  sameRange,
  shortDate,
  startOfMonth,
  startOfWeek,
  startOfYear,
  weekdayIndex,
  WEEKDAYS,
  type DateRange,
} from "./dates";
import { OTHER_FLAVOUR, flavourOf } from "./flavours";
import type { Order } from "./orders";

// ---------------------------------------------------------------------------
// Periods

export const PRESETS = {
  month: "This month",
  "30d": "Last 30 days",
  year: "This year",
  lastYear: "Last year",
  custom: "Custom",
} as const;
export type PresetId = keyof typeof PRESETS;

export type Comparison = { label: string; range: DateRange };
export type Period = { range: DateRange; comparisons: Comparison[] };

/**
 * The selected range plus what it's compared against. "To date" presets end
 * today, and their comparisons cover the same days, so a half-finished month
 * is never compared with a whole one.
 */
export function resolvePeriod(preset: PresetId, today: string, custom?: DateRange): Period {
  const lastYearOf = (r: DateRange): Comparison => ({
    label: "vs same time last year",
    range: { from: addYears(r.from, -1), to: addYears(r.to, -1) },
  });

  let range: DateRange;
  let previous: Comparison | null;
  switch (preset) {
    case "month":
      range = { from: startOfMonth(today), to: today };
      previous = {
        label: "vs last month",
        range: { from: addMonths(range.from, -1), to: addMonths(today, -1) },
      };
      break;
    case "30d":
      range = { from: addDays(today, -29), to: today };
      previous = {
        label: "vs previous 30 days",
        range: { from: addDays(range.from, -30), to: addDays(range.from, -1) },
      };
      break;
    case "year":
      range = { from: startOfYear(today), to: today };
      previous = null; // the previous year-to-date *is* the same time last year
      break;
    case "lastYear": {
      const lastYear = addYears(today, -1);
      range = { from: startOfYear(lastYear), to: endOfYear(lastYear) };
      return {
        range,
        comparisons: [{ label: "vs the year before", range: lastYearOf(range).range }],
      };
    }
    case "custom": {
      range = custom && custom.from <= custom.to ? custom : { from: today, to: today };
      const length = daysBetween(range.from, range.to) + 1;
      previous = {
        label: "vs previous period",
        range: { from: addDays(range.from, -length), to: addDays(range.from, -1) },
      };
      break;
    }
  }

  const comparisons = [previous, lastYearOf(range)].filter(
    (c, i, all): c is Comparison =>
      c !== null && all.findIndex((o) => o && sameRange(o.range, c.range)) === i,
  );
  return { range, comparisons };
}

export const ordersIn = (orders: Order[], range: DateRange) =>
  orders.filter((o) => inRange(o.dueDate, range));

// ---------------------------------------------------------------------------
// KPIs

export type Kpis = {
  revenue: number;
  orders: number;
  averageOrder: number | null;
  /** Share of the period's customers who are returning (0–1), or null without names. */
  returning: number | null;
};

/** First-ever order date per customer, across the whole sheet. */
export function firstOrders(all: Order[]) {
  const first = new Map<string, string>();
  for (const o of all) {
    if (!o.customerKey) continue;
    const seen = first.get(o.customerKey);
    if (!seen || o.dueDate < seen) first.set(o.customerKey, o.dueDate);
  }
  return first;
}

/**
 * A customer counts as returning if they'd ordered before this period, or
 * ordered more than once within it.
 */
export function computeKpis(
  orders: Order[],
  range: DateRange,
  first: Map<string, string>,
): Kpis {
  const inPeriod = ordersIn(orders, range);
  const revenue = inPeriod.reduce((sum, o) => sum + o.amount, 0);

  const perCustomer = new Map<string, number>();
  for (const o of inPeriod) {
    if (o.customerKey) perCustomer.set(o.customerKey, (perCustomer.get(o.customerKey) ?? 0) + 1);
  }
  let returning = 0;
  for (const [key, count] of perCustomer) {
    if (count > 1 || (first.get(key) ?? range.from) < range.from) returning += 1;
  }

  return {
    revenue,
    orders: inPeriod.length,
    averageOrder: inPeriod.length ? revenue / inPeriod.length : null,
    returning: perCustomer.size ? returning / perCustomer.size : null,
  };
}

/** Relative change, or null when there's nothing to compare against. */
export function change(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

// ---------------------------------------------------------------------------
// Revenue trend

export type TrendPoint = { label: string; revenue: number; lastYear: number };
export type Trend = { bucket: "week" | "month"; points: TrendPoint[] };

/** Weekly buckets up to ~3 months, monthly beyond. Last year is aligned bucket by bucket. */
export function revenueTrend(orders: Order[], range: DateRange): Trend {
  const bucket = daysBetween(range.from, range.to) <= 92 ? "week" : "month";
  const lastYear = { from: addYears(range.from, -1), to: addYears(range.to, -1) };

  const indexOf = (iso: string, base: DateRange) =>
    bucket === "week"
      ? Math.floor(daysBetween(startOfWeek(base.from), startOfWeek(iso)) / 7)
      : (Number(iso.slice(0, 4)) - Number(base.from.slice(0, 4))) * 12 +
        Number(iso.slice(5, 7)) -
        Number(base.from.slice(5, 7));

  const count = indexOf(range.to, range) + 1;
  const points: TrendPoint[] = Array.from({ length: count }, (_, i) => {
    const start =
      bucket === "week"
        ? addDays(startOfWeek(range.from), i * 7)
        : addMonths(startOfMonth(range.from), i);
    return {
      label: bucket === "week" ? shortDate(start < range.from ? range.from : start) : monthLabel(start),
      revenue: 0,
      lastYear: 0,
    };
  });

  for (const o of orders) {
    if (inRange(o.dueDate, range)) points[indexOf(o.dueDate, range)].revenue += o.amount;
    else if (inRange(o.dueDate, lastYear)) {
      const i = indexOf(o.dueDate, lastYear);
      if (points[i]) points[i].lastYear += o.amount;
    }
  }
  return { bucket, points };
}

// ---------------------------------------------------------------------------
// Breakdowns

export type Ranked = { name: string; revenue: number; orders: number };

/** Top flavours by the chosen measure; the tail is folded into "Other" (always last). */
export function topFlavours(orders: Order[], by: "revenue" | "orders", limit = 7): Ranked[] {
  const groups = new Map<string, Ranked>();
  for (const o of orders) {
    const name = flavourOf(o.cakeType);
    const g = groups.get(name) ?? { name, revenue: 0, orders: 0 };
    g.revenue += o.amount;
    g.orders += 1;
    groups.set(name, g);
  }
  const other = groups.get(OTHER_FLAVOUR) ?? { name: OTHER_FLAVOUR, revenue: 0, orders: 0 };
  groups.delete(OTHER_FLAVOUR);
  const ranked = [...groups.values()].sort((a, b) => b[by] - a[by]);
  for (const tail of ranked.splice(limit)) {
    other.revenue += tail.revenue;
    other.orders += tail.orders;
  }
  return other.orders ? [...ranked, other] : ranked;
}

export type WeekdayCount = { day: (typeof WEEKDAYS)[number]; orders: number; revenue: number };

export function byWeekday(orders: Order[]): WeekdayCount[] {
  const days = WEEKDAYS.map((day) => ({ day, orders: 0, revenue: 0 }));
  for (const o of orders) {
    const d = days[weekdayIndex(o.dueDate)];
    d.orders += 1;
    d.revenue += o.amount;
  }
  return days;
}

export type CustomerRow = Ranked & { lastOrder: string };

export function topCustomers(orders: Order[], limit = 10): CustomerRow[] {
  const groups = new Map<string, CustomerRow>();
  for (const o of orders) {
    if (!o.customerKey || !o.customer) continue;
    const g = groups.get(o.customerKey) ?? { name: o.customer, revenue: 0, orders: 0, lastOrder: "" };
    g.revenue += o.amount;
    g.orders += 1;
    if (o.dueDate > g.lastOrder) {
      g.lastOrder = o.dueDate;
      g.name = o.customer; // show the most recent spelling
    }
    groups.set(o.customerKey, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
    .slice(0, limit);
}
