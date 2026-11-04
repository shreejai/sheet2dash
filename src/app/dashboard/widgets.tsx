"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { SegmentedControl } from "@/components/segmented-control";
import { WEEKDAYS } from "@/lib/dates";
import { formatAud, formatCount, formatDate } from "@/lib/format";
import { OTHER_FLAVOUR } from "@/lib/flavours";
import type { Comparison, CustomerRow, Kpis, Ranked, Trend, WeekdayCount } from "@/lib/metrics";
import { change } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// Shared pieces

/** Axis ticks: A$0 · A$500 · A$1K · A$12K */
const compactAud = (v: number) =>
  v >= 1000 ? `A$${Number((v / 1000).toFixed(1))}K` : `A$${Math.round(v)}`;

/**
 * Every widget's card, Apple Health style: a small label naming the widget,
 * its main message as a large headline, and a line of detail beneath. The
 * headline means nobody has to read the answer off the chart (HIG › Charts).
 */
export function WidgetCard({
  label,
  value,
  detail,
  action,
  footnote,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  /** How the numbers were worked out, under the content. */
  footnote?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-muted-foreground">{label}</h2>
            {value && <p className="title-1 truncate tabular-nums">{value}</p>}
            {detail && (
              <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                {detail}
              </div>
            )}
          </div>
          {action}
        </div>
        {children}
        {footnote && <p className="mt-auto text-caption text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}

const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;

function Empty() {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">No orders in this period.</p>
  );
}

/** Every chart has a table twin, so no value is hover-only. */
function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="text-sm">
      <summary className="w-fit cursor-pointer py-1 text-xs font-medium text-tint select-none pointer-coarse:py-3">
        Show as table
      </summary>
      <div className="mt-1 max-h-72 overflow-auto rounded-xl bg-background/60">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-card text-xs text-muted-foreground shadow-[0_0.5px_0_var(--separator)]">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={`px-3 py-1.5 font-medium ${i ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-separator">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i} className={`px-3 py-1.5 ${i ? "text-right tabular-nums" : ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Tooltip: value first and strong, series name secondary, keyed by a short line. */
function Tip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="grid min-w-36 gap-1 rounded-xl bg-popover px-3 py-2 text-xs shadow-[0_8px_24px_rgb(0_0_0/0.14),0_0_0_0.5px_var(--separator)]">
      <div className="text-muted-foreground">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} />}
          <span className="font-semibold text-foreground tabular-nums">{r.value}</span>
          <span className="text-muted-foreground">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function Toggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <SegmentedControl
      label={label}
      value={value}
      onChange={onChange}
      options={(Object.keys(options) as T[]).map((key) => ({ value: key, label: options[key] }))}
      className="w-44"
    />
  );
}

// ---------------------------------------------------------------------------
// KPI row

function Delta({ value, label, unit }: { value: number | null; label: string; unit: "%" | "pts" }) {
  if (value === null) {
    return (
      <li className="text-xs text-muted-foreground">
        No data <span>{label}</span>
      </li>
    );
  }
  const amount = Math.round(Math.abs(value) * 100);
  const flat = amount === 0;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <li className="flex flex-wrap items-center gap-x-1 text-xs">
      <span
        className={`flex items-center gap-0.5 font-medium ${
          flat ? "text-muted-foreground" : up ? "text-chart-good" : "text-chart-bad"
        }`}
      >
        {!flat && <Icon className="size-3.5" aria-hidden />}
        {flat ? "No change" : `${up ? "+" : "−"}${amount}${unit === "%" ? "%" : " pts"}`}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </li>
  );
}

export function KpiRow({
  current,
  comparisons,
  showReturning,
  standalone = false,
}: {
  current: Kpis;
  comparisons: { comparison: Comparison; kpis: Kpis }[];
  showReturning: boolean;
  /** In a card of its own, rather than under the period header. */
  standalone?: boolean;
}) {
  const tiles: {
    label: string;
    value: string;
    pick: (k: Kpis) => number | null;
    unit: "%" | "pts";
  }[] = [
    {
      label: "Revenue",
      value: formatAud(current.revenue),
      pick: (k) => k.revenue,
      unit: "%",
    },
    {
      label: "Orders",
      value: formatCount(current.orders),
      pick: (k) => k.orders,
      unit: "%",
    },
    {
      label: "Average order",
      value: current.averageOrder === null ? "—" : formatAud(Math.round(current.averageOrder)),
      pick: (k) => k.averageOrder,
      unit: "%",
    },
  ];
  if (showReturning) {
    tiles.push({
      label: "Returning customers",
      value: current.returning === null ? "—" : `${Math.round(current.returning * 100)}%`,
      pick: (k) => k.returning,
      unit: "pts",
    });
  }

  return (
    // Bleeds to the card's edges so the hairlines run edge to edge, like grouped rows.
    <dl
      className={`-mx-(--card-spacing) grid grid-cols-2 ${
        standalone ? "-my-(--card-spacing)" : "-mb-(--card-spacing) border-t border-separator"
      } ${tiles.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
    >
      {tiles.map((tile, i) => {
        const now = tile.pick(current);
        return (
          <div
            key={tile.label}
            className={`flex min-w-0 flex-col gap-1 border-separator px-4 py-3.5 ${
              // Hairlines between figures: a 2×2 grid on phones, one row on wide screens.
              i % 2 === 1 ? "border-l" : i > 0 ? "lg:border-l" : ""
            } ${i >= 2 ? "border-t lg:border-t-0" : ""}`}
          >
            <dt className="text-xs font-semibold text-muted-foreground">{tile.label}</dt>
            <dd className="title-1 truncate tabular-nums">{tile.value}</dd>
            <dd>
              <ul className="flex flex-col gap-0.5">
                {comparisons.map(({ comparison, kpis }) => {
                  const before = tile.pick(kpis);
                  const delta =
                    tile.unit === "pts"
                      ? now === null || before === null
                        ? null
                        : now - before
                      : change(now, before);
                  return (
                    <Delta
                      key={comparison.label}
                      value={delta}
                      label={comparison.label}
                      unit={tile.unit}
                    />
                  );
                })}
              </ul>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Revenue trend

const trendConfig = {
  revenue: { label: "This period", color: "var(--chart-1)" },
  lastYear: { label: "Last year", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Round axis steps people read at a glance (HIG › Charts): 1, 2, 2.5 or 5 × 10ⁿ. */
function niceTicks(max: number, target = 4) {
  if (max <= 0) return [0];
  const raw = max / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/**
 * Revenue for the period, Apple Health style: the total in large type with the
 * change in words, then a bar per week or month beside last year's.
 */
export function RevenueTrendChart({ trend, compare = true }: { trend: Trend; compare?: boolean }) {
  const hasData = trend.points.some((p) => p.revenue || (compare && p.lastYear));
  const total = trend.points.reduce((sum, p) => sum + p.revenue, 0);
  const before = trend.points.reduce((sum, p) => sum + p.lastYear, 0);
  const pct = change(total, before);
  const rounded = pct === null ? null : Math.round(pct * 100);
  const ticks = niceTicks(
    Math.max(...trend.points.map((p) => Math.max(p.revenue, compare ? p.lastYear : 0))),
  );
  const average = trend.points.length ? total / trend.points.length : 0;
  // "Mar 2026" → "Mar" when the whole chart is in one year.
  const years = new Set(trend.points.map((p) => p.label.match(/\d{4}$/)?.[0]));
  const tick = (label: string) => (years.size === 1 ? label.replace(/ \d{4}$/, "") : label);
  const Icon = rounded !== null && rounded < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <WidgetCard
      label={`Revenue · by ${trend.bucket}`}
      value={formatAud(total)}
      detail={
        !compare ? (
          `Average ${formatAud(Math.round(average))} a ${trend.bucket}`
        ) : rounded === null ? (
          "Nothing to compare from last year"
        ) : rounded === 0 ? (
          "About the same as last year"
        ) : (
          <>
            <span
              className={`flex items-center gap-0.5 font-semibold tabular-nums ${
                rounded > 0 ? "text-chart-good" : "text-chart-bad"
              }`}
            >
              <Icon className="size-3.5" aria-hidden />
              {rounded > 0 ? "+" : "−"}
              {Math.abs(rounded)}%
            </span>
            on the same {trend.bucket}s last year
          </>
        )
      }
      action={
        // One series needs no legend: the label names it.
        hasData &&
        compare && (
          <ul className="flex gap-3 text-xs text-muted-foreground" aria-label="Legend">
            {Object.values(trendConfig).map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        )
      }
    >
      {hasData ? (
        <>
          <ChartContainer config={trendConfig} className="aspect-auto h-56 w-full">
            <BarChart
              data={trend.points}
              barGap={2}
              barCategoryGap="22%"
              margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={8}
                tickFormatter={tick}
              />
              <YAxis
                orientation="right"
                width={52}
                tickLine={false}
                axisLine={false}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
                tickFormatter={compactAud}
                className="tabular-nums"
              />
              <ChartTooltip
                cursor={{ fill: "var(--fill)", radius: 6 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <Tip
                      title={String(label)}
                      rows={[
                        {
                          label: "This period",
                          value: formatAud(Number(payload[0].payload.revenue)),
                          color: "var(--chart-1)",
                        },
                        ...(compare
                          ? [
                              {
                                label: "Last year",
                                value: formatAud(Number(payload[0].payload.lastYear)),
                                color: "var(--chart-2)",
                              },
                            ]
                          : []),
                      ]}
                    />
                  ) : null
                }
              />
              <Bar
                dataKey="revenue"
                fill="var(--color-revenue)"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              />
              {compare && (
                <Bar
                  dataKey="lastYear"
                  fill="var(--color-lastYear)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                  isAnimationActive={false}
                />
              )}
            </BarChart>
          </ChartContainer>
          <TableView
            head={[
              trend.bucket === "week" ? "Week starting" : "Month",
              "This period",
              ...(compare ? ["Last year"] : []),
            ]}
            rows={trend.points.map((p) => [
              p.label,
              formatAud(p.revenue),
              ...(compare ? [formatAud(p.lastYear)] : []),
            ])}
          />
        </>
      ) : (
        <Empty />
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Top flavours

const MEASURES = { revenue: "Revenue", orders: "Orders" } as const;
type Measure = keyof typeof MEASURES;

export function FlavoursChart({
  data,
  initialMeasure = "revenue",
}: {
  data: (by: Measure) => Ranked[];
  initialMeasure?: Measure;
}) {
  const [by, setBy] = useState<Measure>(initialMeasure);
  const rows = data(by);
  const format = (v: number) => (by === "revenue" ? formatAud(v) : formatCount(v));
  const leader = rows.find((r) => r.name !== OTHER_FLAVOUR);
  const sum = rows.reduce((t, r) => t + r[by], 0);
  return (
    <WidgetCard
      label={`Top flavours · by ${by === "revenue" ? "revenue" : "orders"}`}
      value={leader?.name}
      detail={
        leader &&
        sum > 0 && (
          <>
            <span className="font-semibold text-foreground tabular-nums">
              {Math.round((leader[by] / sum) * 100)}%
            </span>
            of {by === "revenue" ? "revenue" : "orders"} · {format(leader[by])}
          </>
        )
      }
      footnote="Grouped from the cake description; the first flavour mentioned counts."
      action={<Toggle label="Measure" value={by} options={MEASURES} onChange={setBy} />}
    >
      {rows.length ? (
        <>
          <ChartContainer
            config={{ value: { label: MEASURES[by], color: "var(--chart-1)" } }}
            className="aspect-auto w-full"
            style={{ height: rows.length * 36 + 8 }}
          >
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 72, left: 0, bottom: 0 }}
            >
              <XAxis type="number" dataKey={by} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={104}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <ChartTooltip
                cursor={{ fill: "var(--fill)", radius: 6 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <Tip
                      title={String(payload[0].payload.name)}
                      rows={[
                        {
                          label: "revenue",
                          value: formatAud(payload[0].payload.revenue),
                        },
                        {
                          label: "orders",
                          value: formatCount(payload[0].payload.orders),
                        },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey={by} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell
                    key={r.name}
                    fill={r.name === OTHER_FLAVOUR ? "var(--chart-2)" : "var(--chart-1)"}
                  />
                ))}
                <LabelList
                  dataKey={by}
                  position="right"
                  className="fill-foreground tabular-nums"
                  formatter={(v: unknown) => format(Number(v))}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          <TableView
            head={["Flavour", "Orders", "Revenue"]}
            rows={rows.map((r) => [r.name, formatCount(r.orders), formatAud(r.revenue)])}
          />
        </>
      ) : (
        <Empty />
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Busiest pickup days

export function WeekdayChart({ data }: { data: WeekdayCount[] }) {
  const hasData = data.some((d) => d.orders);
  const count = data.reduce((t, d) => t + d.orders, 0);
  const busiest = data.reduce((a, d) => (d.orders > a.orders ? d : a), data[0]);
  return (
    <WidgetCard
      label="Busiest pickup day"
      value={hasData ? FULL_DAYS[WEEKDAYS.indexOf(busiest.day)] : undefined}
      detail={
        hasData && (
          <>
            <span className="font-semibold text-foreground tabular-nums">
              {Math.round((busiest.orders / count) * 100)}%
            </span>
            of pickups · {plural(busiest.orders, "order")}
          </>
        )
      }
      footnote="Orders by the day of the week they're due."
    >
      {hasData ? (
        <>
          <ChartContainer
            config={{ orders: { label: "Orders", color: "var(--chart-1)" } }}
            className="aspect-auto h-56 w-full"
          >
            <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis hide />
              <ChartTooltip
                cursor={{ fill: "var(--fill)", radius: 6 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <Tip
                      title={String(payload[0].payload.day)}
                      rows={[
                        {
                          label: "orders",
                          value: formatCount(payload[0].payload.orders),
                        },
                        {
                          label: "revenue",
                          value: formatAud(payload[0].payload.revenue),
                        },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar
                dataKey="orders"
                fill="var(--color-orders)"
                barSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="orders"
                  position="top"
                  className="fill-foreground tabular-nums"
                  formatter={(v: unknown) => (Number(v) ? formatCount(Number(v)) : "")}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          <TableView
            head={["Day", "Orders", "Revenue"]}
            rows={data.map((d) => [d.day, formatCount(d.orders), formatAud(d.revenue)])}
          />
        </>
      ) : (
        <Empty />
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Top customers

export function CustomersTable({ rows }: { rows: CustomerRow[] }) {
  return (
    <WidgetCard
      label="Top customers · by revenue"
      value={rows[0]?.name}
      detail={
        rows[0] && (
          <>
            <span className="font-semibold text-foreground tabular-nums">
              {formatAud(rows[0].revenue)}
            </span>
            from {plural(rows[0].orders, "order")} in this period
          </>
        )
      }
    >
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="shadow-[0_0.5px_0_var(--separator)]">
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell">
                  Last order
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator">
              {rows.map((c) => (
                <tr key={c.name}>
                  <td className="py-2.5 pr-3">{c.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(c.orders)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatAud(c.revenue)}</td>
                  <td className="hidden py-2.5 pl-3 text-right whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                    {formatDate(c.lastOrder)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Upcoming orders

const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
