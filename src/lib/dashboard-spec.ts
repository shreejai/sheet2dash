// Which widgets a dashboard shows, in what order, and each one's options.
// Generated from the confirmed column roles, then edited by the owner (plan step 8).

import type { ColumnMapping } from "./orders";

type OptionValue = string | number | boolean;

export type SettingDef = {
  label: string;
  options: readonly { value: OptionValue; label: string }[];
  default: OptionValue;
};

export const WIDGETS = {
  upcoming: {
    title: "Upcoming pickups",
    blurb: "A calendar of the orders due soon",
    needs: [],
    settings: {
      days: {
        label: "Days ahead",
        options: [
          { value: 7, label: "7" },
          { value: 14, label: "14" },
          { value: 30, label: "30" },
        ],
        default: 14,
      },
    },
  },
  kpis: {
    title: "Key numbers",
    blurb: "Revenue, orders, average order and returning customers",
    needs: [],
    settings: {},
  },
  revenueTrend: {
    title: "Revenue",
    blurb: "Revenue by week or month",
    needs: [],
    settings: {
      compare: {
        label: "Compare with last year",
        options: [
          { value: true, label: "On" },
          { value: false, label: "Off" },
        ],
        default: true,
      },
    },
  },
  topFlavours: {
    title: "Top flavours",
    blurb: "The flavours that sell best",
    needs: ["cakeType"],
    settings: {
      measure: {
        label: "Rank by",
        options: [
          { value: "revenue", label: "Revenue" },
          { value: "orders", label: "Orders" },
        ],
        default: "revenue",
      },
      limit: {
        label: "Flavours shown",
        options: [
          { value: 5, label: "5" },
          { value: 7, label: "7" },
          { value: 10, label: "10" },
        ],
        default: 7,
      },
    },
  },
  busiestDays: {
    title: "Busiest pickup day",
    blurb: "Orders by day of the week",
    needs: [],
    settings: {},
  },
  topCustomers: {
    title: "Top customers",
    blurb: "Who spends the most",
    needs: ["customer"],
    settings: {
      limit: {
        label: "Customers shown",
        options: [
          { value: 5, label: "5" },
          { value: 10, label: "10" },
          { value: 20, label: "20" },
        ],
        default: 10,
      },
    },
  },
} as const satisfies Record<
  string,
  {
    title: string;
    blurb: string;
    needs: (keyof ColumnMapping)[];
    settings: Record<string, SettingDef>;
  }
>;

export type WidgetType = keyof typeof WIDGETS;
export type WidgetSettings = Record<string, OptionValue>;
export type Widget = { id: string; type: WidgetType; settings: WidgetSettings };

export type DashboardSpec = {
  version: 3;
  /** Shown widgets, top to bottom. A widget that isn't listed is hidden. */
  widgets: Widget[];
};

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

/** The columns a widget needs that aren't mapped, if any. */
export const missingColumns = (type: WidgetType, mapping: ColumnMapping) =>
  WIDGETS[type].needs.filter((role) => !mapping[role]);

/** A setting's value, falling back to its default when unset or no longer valid. */
export function setting<T extends OptionValue>(widget: Widget, key: string): T {
  const def = (WIDGETS[widget.type].settings as Record<string, SettingDef>)[key];
  const value = widget.settings[key];
  return (def.options.some((o) => o.value === value) ? value : def.default) as T;
}

export const newWidget = (type: WidgetType): Widget => ({ id: type, type, settings: {} });

/** Every widget whose columns are mapped, in a sensible reading order. */
export function generateSpec(mapping: ColumnMapping): DashboardSpec {
  return {
    version: 3,
    widgets: WIDGET_TYPES.filter((type) => !missingColumns(type, mapping).length).map(newWidget),
  };
}

/**
 * Accepts a stored or submitted spec only if it's one this code understands:
 * known widget types, each at most once, settings limited to known keys and
 * allowed values. Older versions are upgraded (v1 predates upcoming orders,
 * v2 predates settings).
 */
export function readSpec(value: unknown): DashboardSpec | null {
  if (!value || typeof value !== "object") return null;
  const spec = value as { version?: unknown; widgets?: unknown };
  if (![1, 2, 3].includes(spec.version as number) || !Array.isArray(spec.widgets)) return null;

  const seen = new Set<WidgetType>();
  const widgets: Widget[] = [];
  for (const raw of spec.widgets as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const { type, settings } = raw as { type?: unknown; settings?: unknown };
    if (typeof type !== "string" || !(type in WIDGETS)) continue;
    const t = type as WidgetType;
    if (seen.has(t)) continue;
    seen.add(t);

    const defs = WIDGETS[t].settings as Record<string, SettingDef>;
    const clean: WidgetSettings = {};
    if (settings && typeof settings === "object") {
      for (const [key, v] of Object.entries(settings)) {
        if (defs[key]?.options.some((o) => o.value === v)) clean[key] = v as OptionValue;
      }
    }
    widgets.push({ id: t, type: t, settings: clean });
  }

  if (spec.version === 1 && !seen.has("upcoming")) widgets.unshift(newWidget("upcoming"));
  return { version: 3, widgets };
}

/** Drop widgets whose columns are no longer mapped (e.g. after editing the columns). */
export const fitSpec = (spec: DashboardSpec, mapping: ColumnMapping): DashboardSpec => ({
  version: 3,
  widgets: spec.widgets.filter((w) => !missingColumns(w.type, mapping).length),
});
