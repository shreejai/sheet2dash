"use client";

import { useMemo, useState } from "react";
import { generateSpec, type DashboardSpec } from "@/lib/dashboard-spec";
import { DEMO_BUSINESS, demoOrders } from "@/lib/demo-data";
import { formatCount } from "@/lib/format";
import type { ColumnMapping } from "@/lib/orders";
import { DashboardView } from "../dashboard/dashboard-view";
import { EditDashboard } from "../dashboard/edit-dashboard";

/** Every column mapped, as if the owner had confirmed a complete sheet. */
const DEMO_MAPPING: ColumnMapping = {
  dueDate: "Due date",
  amount: "Charged",
  pickupTime: "Pickup time",
  cakeType: "Type",
  customer: "Name",
};

/**
 * The real dashboard on sample data. Edit works, but the layout only lives in
 * this page: nothing is saved, and a reload starts fresh.
 */
export function DemoDashboard({ today }: { today: string }) {
  const { orders, unpriced } = useMemo(() => demoOrders(today), [today]);
  const [spec, setSpec] = useState<DashboardSpec>(() => generateSpec(DEMO_MAPPING));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="title-2">{DEMO_BUSINESS}</h1>
          <p className="text-xs text-muted-foreground">
            {formatCount(orders.length)} sample orders · a made-up cake shop, for trying Sheet2Dash
          </p>
        </div>
        <EditDashboard
          spec={spec}
          mapping={DEMO_MAPPING}
          onSave={async (next) => {
            setSpec(next);
            return { ok: true };
          }}
        />
      </div>
      <DashboardView orders={orders} unpriced={unpriced} today={today} spec={spec} />
    </div>
  );
}
