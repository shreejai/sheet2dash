"use client";

import { useMemo } from "react";
import {
  isScoped,
  setting,
  type DashboardSpec,
  type Widget,
  type WidgetType,
} from "@/lib/dashboard-spec";
import {
  byWeekday,
  computeKpis,
  firstOrders,
  ordersIn,
  revenueTrend,
  topCustomers,
  topFlavours,
  upcomingOrders,
} from "@/lib/metrics";
import type { Order, UnpricedOrder } from "@/lib/orders";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodCard, usePeriod } from "./period-card";
import { UpcomingCalendar } from "./upcoming-calendar";
import { CustomersTable, FlavoursChart, KpiRow, RevenueTrendChart, WeekdayChart } from "./widgets";

const FULL_WIDTH = new Set<WidgetType>(["upcoming", "kpis", "revenueTrend"]);

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
  const periodState = usePeriod(today);
  const { period } = periodState;
  const first = useMemo(() => firstOrders(orders), [orders]);
  const inPeriod = useMemo(() => ordersIn(orders, period.range), [orders, period.range]);
  const hasCustomers = orders.some((o) => o.customerKey);

  // Widgets render in the owner's order. The period card goes just before the
  // first widget the date range applies to; if that widget is the key numbers,
  // they sit inside the period card.
  const firstScoped = spec.widgets.findIndex((w) => isScoped(w.type));
  const items: React.ReactNode[] = [];
  spec.widgets.forEach((w, i) => {
    if (i === firstScoped) {
      const merged = w.type === "kpis";
      items.push(
        <div key="period" className="min-w-0 lg:col-span-2">
          <PeriodCard state={periodState}>{merged && renderWidget(w)}</PeriodCard>
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
