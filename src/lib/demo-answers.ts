// Answers for the demo's suggested questions, worked out from the sample
// orders with the same calculations the dashboard uses, so they always match
// it. No AI call: the demo is free to run. **bold** marks emphasis.

import { addMonths, endOfMonth, startOfMonth, startOfYear, weekdayIndex } from "./dates";
import { change, ordersIn, topFlavours, upcomingOrders } from "./metrics";
import { formatAud, formatCount, formatTime } from "./format";
import { OTHER_FLAVOUR } from "./flavours";
import type { Order, UnpricedOrder } from "./orders";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const monthName = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: "UTC" }).format(utc(iso));
const monthYear = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    utc(iso),
  );
const dayName = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(utc(iso));
const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
const sum = (orders: Order[]) => orders.reduce((t, o) => t + o.amount, 0);

export const DEMO_QUESTIONS = [
  "How did last month compare with the month before?",
  "What are my top 3 flavours this year?",
  "Who are my most loyal customers?",
  "What's due this weekend?",
] as const;

export type DemoQuestion = (typeof DEMO_QUESTIONS)[number];

export function demoAnswer(
  question: DemoQuestion,
  orders: Order[],
  unpriced: UnpricedOrder[],
  today: string,
): string {
  switch (question) {
    case DEMO_QUESTIONS[0]: {
      const last = startOfMonth(addMonths(today, -1));
      const before = addMonths(last, -1);
      const a = ordersIn(orders, { from: last, to: endOfMonth(last) });
      const b = ordersIn(orders, { from: before, to: endOfMonth(before) });
      const pct = change(sum(a), sum(b));
      const trend =
        pct === null
          ? ""
          : Math.round(pct * 100) === 0
            ? ", about the same as"
            : `, **${pct > 0 ? "up" : "down"} ${Math.abs(Math.round(pct * 100))}%** on`;
      return (
        `**${monthName(last)}** brought in **${formatAud(sum(a))}** from ${plural(a.length, "order")}` +
        `${trend} ${monthName(before)} (${formatAud(sum(b))} from ${plural(b.length, "order")}).`
      );
    }

    case DEMO_QUESTIONS[1]: {
      const thisYear = ordersIn(orders, { from: startOfYear(today), to: today });
      const top = topFlavours(thisYear, "revenue", 3).filter((f) => f.name !== OTHER_FLAVOUR);
      const total = sum(thisYear);
      if (!top.length) return "There are no orders yet this year.";
      return [
        `Your top flavours this year, by revenue:`,
        ...top.map(
          (f, i) =>
            `${i + 1}. **${f.name}**: ${formatAud(f.revenue)} from ${plural(f.orders, "order")}` +
            ` (${Math.round((f.revenue / total) * 100)}% of revenue)`,
        ),
      ].join("\n");
    }

    case DEMO_QUESTIONS[2]: {
      const groups = new Map<string, { name: string; orders: Order[] }>();
      for (const o of orders) {
        if (!o.customerKey || o.dueDate > today) continue;
        const g = groups.get(o.customerKey) ?? { name: o.customer!, orders: [] };
        g.orders.push(o);
        groups.set(o.customerKey, g);
      }
      const top = [...groups.values()]
        .sort((a, b) => b.orders.length - a.orders.length || sum(b.orders) - sum(a.orders))
        .slice(0, 3);
      return [
        `Your most loyal customers, by number of orders:`,
        ...top.map((c, i) => {
          const first = c.orders.reduce((m, o) => (o.dueDate < m ? o.dueDate : m), today);
          return (
            `${i + 1}. **${c.name}**: ${plural(c.orders.length, "order")}, ${formatAud(sum(c.orders))}` +
            ` in total, ordering since ${monthYear(first)}`
          );
        }),
      ].join("\n");
    }

    case DEMO_QUESTIONS[3]: {
      // This weekend: today and tomorrow on a weekend, otherwise the coming Saturday and Sunday.
      const wd = weekdayIndex(today);
      const days = upcomingOrders([...orders, ...unpriced], today, 14).filter((d) => {
        const offset = Math.round((utc(d.date).getTime() - utc(today).getTime()) / 86_400_000);
        return wd >= 5 ? offset <= 6 - wd : offset >= 5 - wd && offset <= 6 - wd;
      });
      if (!days.length) return "Nothing is due this weekend.";
      const count = days.reduce((t, d) => t + d.orders.length, 0);
      return [
        `**${plural(count, "order")}** due this weekend:`,
        ...days.flatMap((d, i) => [
          ...(i > 0 ? [``] : []),
          `**${dayName(d.date)}**`,
          ...d.orders.map(
            (o) =>
              `• ${o.pickupMinutes === null ? "Any time" : formatTime(o.pickupMinutes)}: ` +
              `${o.cakeType} (${o.customer}, ${o.amount === null ? "no price yet" : formatAud(o.amount)})`,
          ),
        ]),
      ].join("\n");
    }
  }
}
