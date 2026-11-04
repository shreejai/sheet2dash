"use client";

import { useMemo, useState } from "react";
import type { DashboardSpec, WidgetType } from "@/lib/dashboard-spec";
import { addDays, shortDate, type DateRange } from "@/lib/dates";
import {
  PRESETS,
  byWeekday,
  computeKpis,
  firstOrders,
  ordersIn,
  resolvePeriod,
  revenueTrend,
  topCustomers,
  topFlavours,
  upcomingOrders,
  type PresetId,
} from "@/lib/metrics";
import type { Order, UnpricedOrder } from "@/lib/orders";
import {
  CustomersTable,
  FlavoursChart,
  KpiRow,
  RevenueTrendChart,
  UpcomingOrders,
  WeekdayChart,
} from "./widgets";

const FULL_WIDTH = new Set<WidgetType>(["kpis", "revenueTrend"]);
/** Widgets about what's coming up, not the selected period: shown above the date filter. */
const UNSCOPED = new Set<WidgetType>(["upcoming"]);

export function DashboardView({
  orders,
  unpriced,
  today,
  spec,
}: {
  orders: Order[];
  /** Orders without a price yet: shown as upcoming, never counted as revenue. */
  unpriced: UnpricedOrder[];
  /** Today in the business's timezone, from the server so both renders agree. */
  today: string;
  spec: DashboardSpec;
}) {
  const [preset, setPreset] = useState<PresetId>("year");
  const [custom, setCustom] = useState<DateRange>({
    from: addDays(today, -89),
    to: today,
  });

  const period = useMemo(() => resolvePeriod(preset, today, custom), [preset, today, custom]);
  const first = useMemo(() => firstOrders(orders), [orders]);
  const inPeriod = useMemo(() => ordersIn(orders, period.range), [orders, period.range]);
  const hasCustomers = orders.some((o) => o.customerKey);

  const sameYear = period.range.from.slice(0, 4) === period.range.to.slice(0, 4);
  const rangeLabel = `${shortDate(period.range.from, !sameYear)} – ${shortDate(period.range.to, true)}`;

  const scoped = spec.widgets.filter((w) => !UNSCOPED.has(w.type));

  return (
    <div className="flex flex-col gap-4">
      {spec.widgets
        .filter((w) => UNSCOPED.has(w.type))
        .map(({ id, type }) => (
          <div key={id}>{renderWidget(type)}</div>
        ))}

      {/* One filter row above everything it scopes. */}
      <div className="flex flex-col gap-2">
        <div role="radiogroup" aria-label="Date range" className="flex flex-wrap gap-1.5">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={preset === id}
              onClick={() => setPreset(id)}
              className={`rounded-full px-3 py-1 text-sm ring-1 transition-colors ${
                preset === id
                  ? "bg-foreground text-background ring-foreground"
                  : "text-muted-foreground ring-foreground/15 hover:text-foreground"
              }`}
            >
              {PRESETS[id]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {preset === "custom" ? (
            <>
              <input
                type="date"
                aria-label="From"
                value={custom.from}
                max={custom.to}
                onChange={(e) =>
                  e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))
                }
                className="rounded-md border bg-background px-2 py-1 text-foreground"
              />
              <span>to</span>
              <input
                type="date"
                aria-label="To"
                value={custom.to}
                min={custom.from}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
                className="rounded-md border bg-background px-2 py-1 text-foreground"
              />
            </>
          ) : (
            <span>{rangeLabel}</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {scoped.map(({ id, type }) => (
          <div key={id} className={FULL_WIDTH.has(type) ? "lg:col-span-2" : "min-w-0"}>
            {renderWidget(type)}
          </div>
        ))}
      </div>
    </div>
  );

  function renderWidget(type: WidgetType) {
    switch (type) {
      case "upcoming":
        return (
          <UpcomingOrders days={upcomingOrders([...orders, ...unpriced], today)} today={today} />
        );
      case "kpis":
        return (
          <KpiRow
            current={computeKpis(orders, period.range, first)}
            comparisons={period.comparisons.map((comparison) => ({
              comparison,
              kpis: computeKpis(orders, comparison.range, first),
            }))}
            showReturning={hasCustomers}
          />
        );
      case "revenueTrend":
        return <RevenueTrendChart trend={revenueTrend(orders, period.range)} />;
      case "topFlavours":
        return <FlavoursChart data={(by) => topFlavours(inPeriod, by)} />;
      case "busiestDays":
        return <WeekdayChart data={byWeekday(inPeriod)} />;
      case "topCustomers":
        return <CustomersTable rows={topCustomers(inPeriod)} />;
    }
  }
}
