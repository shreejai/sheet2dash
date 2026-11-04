// Computations the chat model calls as tools, so every number it quotes is
// calculated here rather than guessed. Pure: takes parsed orders.

import {
  WEEKDAYS,
  monthLabel,
  startOfWeek,
  shortDate,
  weekdayIndex,
  type DateRange,
} from "./dates";
import { flavourOf } from "./flavours";
import { formatAud, formatDate, formatTime } from "./format";
import { firstOrders, computeKpis } from "./metrics";
import type { Order, UnpricedOrder } from "./orders";

export type OrderFilter = {
  from?: string;
  to?: string;
  flavour?: string;
  customer?: string;
  descriptionContains?: string;
};

export const GROUP_BY = [
  "none",
  "year",
  "month",
  "week",
  "weekday",
  "flavour",
  "customer",
] as const;
export type GroupBy = (typeof GROUP_BY)[number];

export const SORT_BY = ["revenue", "orders", "averageOrder", "chronological"] as const;
export type SortBy = (typeof SORT_BY)[number];

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

function matches(o: Order | UnpricedOrder, f: OrderFilter) {
  if (f.from && o.dueDate < f.from) return false;
  if (f.to && o.dueDate > f.to) return false;
  if (f.flavour && lower(flavourOf(o.cakeType)) !== lower(f.flavour)) return false;
  if (f.customer && !lower(o.customerKey).includes(lower(f.customer).trim())) return false;
  if (f.descriptionContains && !lower(o.cakeType).includes(lower(f.descriptionContains)))
    return false;
  return true;
}

function groupKey(o: Order, by: GroupBy): { key: string; label: string } {
  switch (by) {
    case "none":
      return { key: "all", label: "All matching orders" };
    case "year":
      return { key: o.dueDate.slice(0, 4), label: o.dueDate.slice(0, 4) };
    case "month":
      return { key: o.dueDate.slice(0, 7), label: monthLabel(o.dueDate) };
    case "week": {
      const monday = startOfWeek(o.dueDate);
      return { key: monday, label: `Week of ${shortDate(monday, true)}` };
    }
    case "weekday": {
      const i = weekdayIndex(o.dueDate);
      return { key: String(i), label: WEEKDAYS[i] };
    }
    case "flavour": {
      const f = flavourOf(o.cakeType);
      return { key: f, label: f };
    }
    case "customer":
      return { key: o.customerKey ?? "(no name)", label: o.customer ?? "(no name)" };
  }
}

type Totals = { orders: number; revenue: number };

const summarise = (t: Totals) => ({
  orders: t.orders,
  revenue: formatAud(t.revenue),
  averageOrder: t.orders ? formatAud(Math.round((t.revenue / t.orders) * 100) / 100) : null,
});

const pct = (now: number, before: number) =>
  before === 0
    ? null
    : `${now >= before ? "+" : "−"}${Math.round((Math.abs(now - before) / before) * 100)}%`;

/**
 * Totals of priced orders matching a filter, optionally grouped, sorted and
 * compared with another date range. Returns display-ready strings.
 */
export function aggregate(
  orders: Order[],
  input: {
    filter: OrderFilter;
    groupBy: GroupBy;
    sortBy: SortBy;
    limit: number;
    compareTo?: DateRange;
  },
) {
  const matched = orders.filter((o) => matches(o, input.filter));
  const totals = matched.reduce(
    (t, o) => ({ orders: t.orders + 1, revenue: t.revenue + o.amount }),
    { orders: 0, revenue: 0 },
  );

  const result: Record<string, unknown> = { total: summarise(totals) };

  if (input.filter.from && input.filter.to && input.groupBy === "none") {
    const kpis = computeKpis(matched, input.filter as DateRange, firstOrders(orders));
    if (kpis.returning !== null) {
      result.returningCustomers = `${Math.round(kpis.returning * 100)}% of customers had ordered before or ordered more than once`;
    }
  }

  if (input.compareTo) {
    const before = orders
      .filter((o) => matches(o, { ...input.filter, ...input.compareTo }))
      .reduce((t, o) => ({ orders: t.orders + 1, revenue: t.revenue + o.amount }), {
        orders: 0,
        revenue: 0,
      });
    result.comparison = {
      period: `${formatDate(input.compareTo.from)} – ${formatDate(input.compareTo.to)}`,
      ...summarise(before),
      revenueChange: pct(totals.revenue, before.revenue),
      ordersChange: pct(totals.orders, before.orders),
    };
  }

  if (input.groupBy !== "none") {
    const groups = new Map<string, Totals & { label: string }>();
    for (const o of matched) {
      const { key, label } = groupKey(o, input.groupBy);
      const g = groups.get(key) ?? { label, orders: 0, revenue: 0 };
      g.orders += 1;
      g.revenue += o.amount;
      groups.set(key, g);
    }
    const rows = [...groups.entries()].sort(([ka, a], [kb, b]) => {
      if (input.sortBy === "chronological") return ka.localeCompare(kb);
      if (input.sortBy === "averageOrder") return b.revenue / b.orders - a.revenue / a.orders;
      return b[input.sortBy] - a[input.sortBy];
    });
    result.groupCount = rows.length;
    result.groups = rows
      .slice(0, input.limit)
      .map(([, g]) => ({ group: g.label, ...summarise(g) }));
  }

  return result;
}

/** Individual orders (including ones without a price yet), for "what's due…" questions. */
export function listOrders(
  orders: (Order | UnpricedOrder)[],
  input: { filter: OrderFilter; newestFirst: boolean; limit: number },
) {
  const matched = orders
    .filter((o) => matches(o, input.filter))
    .sort((a, b) =>
      input.newestFirst
        ? b.dueDate.localeCompare(a.dueDate)
        : a.dueDate.localeCompare(b.dueDate) ||
          (a.pickupMinutes ?? Infinity) - (b.pickupMinutes ?? Infinity),
    );
  return {
    matchingOrders: matched.length,
    shown: Math.min(matched.length, input.limit),
    orders: matched.slice(0, input.limit).map((o) => ({
      due: `${WEEKDAYS[weekdayIndex(o.dueDate)]} ${formatDate(o.dueDate)}`,
      pickup: o.pickupMinutes === null ? null : formatTime(o.pickupMinutes),
      description: o.cakeType,
      flavour: flavourOf(o.cakeType),
      customer: o.customer,
      amount: o.amount === null ? "price not set" : formatAud(o.amount),
    })),
  };
}
