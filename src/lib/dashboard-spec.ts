// Which widgets a dashboard shows, generated from the confirmed column roles.
// Stored per user so widgets can be added/removed/edited later (plan step 8).

import type { ColumnMapping } from "./orders";

export const WIDGETS = {
  kpis: { title: "Key numbers", needs: [] },
  revenueTrend: { title: "Revenue", needs: [] },
  topFlavours: { title: "Top flavours", needs: ["cakeType"] },
  busiestDays: { title: "Busiest pickup days", needs: [] },
  topCustomers: { title: "Top customers", needs: ["customer"] },
} as const satisfies Record<string, { title: string; needs: (keyof ColumnMapping)[] }>;

export type WidgetType = keyof typeof WIDGETS;

export type DashboardSpec = {
  version: 1;
  widgets: { id: string; type: WidgetType }[];
};

/** Every widget whose columns are mapped, in a sensible reading order. */
export function generateSpec(mapping: ColumnMapping): DashboardSpec {
  const types = (Object.keys(WIDGETS) as WidgetType[]).filter((type) =>
    WIDGETS[type].needs.every((role) => Boolean(mapping[role])),
  );
  return { version: 1, widgets: types.map((type) => ({ id: type, type })) };
}

/** Accepts a stored spec only if it's one this code understands. */
export function readSpec(value: unknown): DashboardSpec | null {
  if (!value || typeof value !== "object") return null;
  const spec = value as Partial<DashboardSpec>;
  if (spec.version !== 1 || !Array.isArray(spec.widgets)) return null;
  const widgets = spec.widgets.filter(
    (w): w is DashboardSpec["widgets"][number] =>
      Boolean(w) && typeof w.id === "string" && w.type in WIDGETS,
  );
  return { version: 1, widgets };
}
