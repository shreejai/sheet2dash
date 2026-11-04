"use client";

import { useMemo, useState } from "react";
import { setting, type DashboardSpec, type Widget, type WidgetType } from "@/lib/dashboard-spec";
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
import { SegmentedControl } from "@/components/segmented-control";
import { Card, CardContent } from "@/components/ui/card";
import { UpcomingCalendar } from "./upcoming-calendar";
import { CustomersTable, FlavoursChart, KpiRow, RevenueTrendChart, WeekdayChart } from "./widgets";

const FULL_WIDTH = new Set<WidgetType>(["upcoming", "kpis", "revenueTrend"]);
/** Widgets about what's coming up, not the selected period: the date range doesn't apply. */
const UNSCOPED = new Set<WidgetType>(["upcoming"]);

/** Short segment labels so all five fit on a phone (HIG: at most about five on iPhone). */
const SEGMENTS: Record<PresetId, string> = {
  month: "Month",
  "30d": "30 Days",
  year: "Year",
  lastYear: "Last Year",
  custom: "Custom",
};

const DATE_INPUT =
  "h-9 rounded-lg bg-fill px-2.5 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 pointer-coarse:h-11 sm:text-sm";

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

  // Widgets render in the owner's order. The period card goes just before the
  // first widget the date range applies to; if that widget is the key numbers,
  // they sit inside the period card.
  const firstScoped = spec.widgets.findIndex((w) => !UNSCOPED.has(w.type));
  const items: React.ReactNode[] = [];
  spec.widgets.forEach((w, i) => {
    if (i === firstScoped) {
      const merged = w.type === "kpis";
      items.push(
        <div key="period" className="min-w-0 lg:col-span-2">
          {periodCard(merged ? w : null)}
        </div>,
      );
      if (merged) return;
    }
    items.push(
      <div key={w.id} className={`min-w-0 ${FULL_WIDTH.has(w.type) ? "lg:col-span-2" : ""}`}>
        {w.type === "kpis" ? (
          <Card>
            <CardContent>{renderWidget(w, true)}</CardContent>
          </Card>
        ) : (
          renderWidget(w)
        )}
      </div>,
    );
  });

  return <div className="grid gap-4 lg:grid-cols-2">{items}</div>;

  /**
   * The period card, styled like the pickups calendar: the period in large
   * type with its dates, the range control beside it, and (when they come
   * first) the key numbers below a hairline.
   */
  function periodCard(kpis: Widget | null) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="title-2">{preset === "custom" ? "Custom range" : PRESETS[preset]}</h2>
              {preset === "custom" ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="date"
                    aria-label="From"
                    value={custom.from}
                    max={custom.to}
                    onChange={(e) =>
                      e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))
                    }
                    className={DATE_INPUT}
                  />
                  <span>to</span>
                  <input
                    type="date"
                    aria-label="To"
                    value={custom.to}
                    min={custom.from}
                    onChange={(e) =>
                      e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))
                    }
                    className={DATE_INPUT}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground tabular-nums">{rangeLabel}</p>
              )}
            </div>
            <SegmentedControl
              label="Date range"
              value={preset}
              onChange={setPreset}
              options={(Object.keys(SEGMENTS) as PresetId[]).map((id) => ({
                value: id,
                label: SEGMENTS[id],
              }))}
              className="w-full shrink-0 lg:w-[28rem]"
            />
          </div>
          {kpis && renderWidget(kpis)}
        </CardContent>
      </Card>
    );
  }

  function renderWidget(widget: Widget, standalone = false) {
    switch (widget.type) {
      case "upcoming": {
        const days = setting<number>(widget, "days");
        return (
          <UpcomingCalendar
            days={upcomingOrders([...orders, ...unpriced], today, days)}
            today={today}
            windowDays={days}
          />
        );
      }
      case "kpis":
        return (
          <KpiRow
            current={computeKpis(orders, period.range, first)}
            comparisons={period.comparisons.map((comparison) => ({
              comparison,
              kpis: computeKpis(orders, comparison.range, first),
            }))}
            showReturning={hasCustomers}
            standalone={standalone}
          />
        );
      case "revenueTrend":
        return (
          <RevenueTrendChart
            trend={revenueTrend(orders, period.range)}
            compare={setting<boolean>(widget, "compare")}
          />
        );
      case "topFlavours": {
        const limit = setting<number>(widget, "limit");
        return (
          <FlavoursChart
            key={setting<string>(widget, "measure")}
            initialMeasure={setting<"revenue" | "orders">(widget, "measure")}
            data={(by) => topFlavours(inPeriod, by, limit)}
          />
        );
      }
      case "busiestDays":
        return <WeekdayChart data={byWeekday(inPeriod)} />;
      case "topCustomers":
        return <CustomersTable rows={topCustomers(inPeriod, setting<number>(widget, "limit"))} />;
    }
  }
}
