"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { daysBetween, shortDate, weekdayIndex, WEEKDAYS } from "@/lib/dates";
import { formatAud, formatCount, formatDate, formatTime } from "@/lib/format";
import { OTHER_FLAVOUR } from "@/lib/flavours";
import type {
  Comparison,
  CustomerRow,
  Kpis,
  Ranked,
  Trend,
  UpcomingDay,
  WeekdayCount,
} from "@/lib/metrics";
import { change } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// Shared pieces

/** Axis ticks: A$0 · A$500 · A$1K · A$12K */
const compactAud = (v: number) =>
  v >= 1000 ? `A$${Number((v / 1000).toFixed(1))}K` : `A$${Math.round(v)}`;

export function WidgetCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Empty() {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">No orders in this period.</p>
  );
}

/** Every chart has a table twin, so no value is hover-only. */
function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground select-none">
        Show as table
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={`px-3 py-1.5 font-medium ${i ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
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
    <div className="grid min-w-36 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-lg">
      <div className="text-muted-foreground">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color && <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />}
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
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border p-0.5 text-xs">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`rounded-md px-2 py-1 transition-colors ${
            value === key
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {options[key]}
        </button>
      ))}
    </div>
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
    <li className="flex items-center gap-1 text-xs">
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
}: {
  current: Kpis;
  comparisons: { comparison: Comparison; kpis: Kpis }[];
  showReturning: boolean;
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
    <dl
      className={`grid grid-cols-2 gap-3 ${tiles.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
    >
      {tiles.map((tile) => {
        const now = tile.pick(current);
        return (
          <div
            key={tile.label}
            className="flex flex-col gap-1 rounded-xl px-4 py-3 ring-1 ring-foreground/10"
          >
            <dt className="text-sm text-muted-foreground">{tile.label}</dt>
            <dd className="text-2xl font-semibold tracking-tight">{tile.value}</dd>
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

export function RevenueTrendChart({ trend }: { trend: Trend }) {
  const hasData = trend.points.some((p) => p.revenue || p.lastYear);
  return (
    <WidgetCard
      title="Revenue"
      description={`By ${trend.bucket}, compared with the same ${trend.bucket}s last year`}
    >
      {hasData ? (
        <>
          <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
            {Object.values(trendConfig).map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
          <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
            <ComposedChart data={trend.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tickFormatter={compactAud}
                className="tabular-nums"
              />
              <ChartTooltip
                cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }}
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
                        {
                          label: "Last year",
                          value: formatAud(Number(payload[0].payload.lastYear)),
                          color: "var(--chart-2)",
                        },
                      ]}
                    />
                  ) : null
                }
              />
              <Line
                dataKey="lastYear"
                type="monotone"
                stroke="var(--color-lastYear)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
              <Area
                dataKey="revenue"
                type="monotone"
                stroke="var(--color-revenue)"
                strokeWidth={2}
                fill="var(--color-revenue)"
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
            </ComposedChart>
          </ChartContainer>
          <TableView
            head={[trend.bucket === "week" ? "Week starting" : "Month", "This period", "Last year"]}
            rows={trend.points.map((p) => [p.label, formatAud(p.revenue), formatAud(p.lastYear)])}
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

export function FlavoursChart({ data }: { data: (by: Measure) => Ranked[] }) {
  const [by, setBy] = useState<Measure>("revenue");
  const rows = data(by);
  const format = (v: number) => (by === "revenue" ? formatAud(v) : formatCount(v));
  return (
    <WidgetCard
      title="Top flavours"
      description="Grouped from the cake description; the first flavour mentioned counts"
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
                cursor={false}
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
  return (
    <WidgetCard title="Busiest pickup days" description="Orders by day of the week they're due">
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
                cursor={false}
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
    <WidgetCard title="Top customers" description="By revenue in this period">
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="py-2 pl-3 text-right font-medium">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => (
                <tr key={c.name}>
                  <td className="py-2 pr-3">{c.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCount(c.orders)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAud(c.revenue)}</td>
                  <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
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

function dayHeading(date: string, today: string) {
  const offset = daysBetween(today, date);
  const name = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : FULL_DAYS[weekdayIndex(date)];
  return { name, date: `${WEEKDAYS[weekdayIndex(date)]} ${shortDate(date)}` };
}

export function UpcomingOrders({ days, today }: { days: UpcomingDay[]; today: string }) {
  const all = days.flatMap((d) => d.orders);
  const unpriced = all.filter((o) => o.amount === null).length;
  const total = days.reduce((sum, d) => sum + d.total, 0);
  const summary = all.length
    ? `${formatCount(all.length)} order${all.length === 1 ? "" : "s"} · ${formatAud(total)}${
        unpriced ? ` + ${unpriced} without a price` : ""
      }`
    : undefined;

  return (
    <WidgetCard title="Upcoming orders · next 14 days" description={summary}>
      {days.length ? (
        <ol className="flex flex-col gap-4">
          {days.map((day) => {
            const heading = dayHeading(day.date, today);
            return (
              <li key={day.date} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                  <h3 className="text-sm font-medium">
                    {heading.name}
                    <span className="font-normal text-muted-foreground"> · {heading.date}</span>
                  </h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {day.orders.length} order{day.orders.length === 1 ? "" : "s"}
                    {day.total > 0 && ` · ${formatAud(day.total)}`}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {day.orders.map((o, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-[4.5rem_1fr_auto] items-start gap-3 text-sm"
                    >
                      <span
                        className={`tabular-nums ${o.pickupMinutes === null ? "text-muted-foreground" : "font-medium"}`}
                      >
                        {o.pickupMinutes === null ? "No time" : formatTime(o.pickupMinutes)}
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words">{o.cakeType ?? "No description"}</span>
                        {o.customer && (
                          <span className="block text-xs text-muted-foreground">{o.customer}</span>
                        )}
                      </span>
                      {o.amount === null ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
                          Price not set
                        </span>
                      ) : (
                        <span className="text-right tabular-nums">{formatAud(o.amount)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No orders due in the next 14 days.
        </p>
      )}
    </WidgetCard>
  );
}
