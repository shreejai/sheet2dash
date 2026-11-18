// Which widgets a dashboard shows, in what order, and each one's options.
// Generated from the confirmed column roles, then edited by the owner (plan step 8).
// Each widget belongs to one sheet kind; a dashboard only ever holds its kind's widgets.

import type { SheetKind, SheetMapping } from "./sheet-kinds";

type OptionValue = string | number | boolean;

export type SettingDef = {
  label: string;
  options: readonly { value: OptionValue; label: string }[];
  default: OptionValue;
};

export const WIDGETS = {
  // Orders ------------------------------------------------------------------
  upcoming: {
    kind: "orders",
    unscoped: true,
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
    kind: "orders",
    title: "Key numbers",
    blurb: "Revenue, orders, average order and returning customers",
    needs: [],
    settings: {},
  },
  revenueTrend: {
    kind: "orders",
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
    kind: "orders",
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
    kind: "orders",
    title: "Busiest pickup day",
    blurb: "Orders by day of the week",
    needs: [],
    settings: {},
  },
  topCustomers: {
    kind: "orders",
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

  // Workouts ----------------------------------------------------------------
  trainingDays: {
    kind: "fitness",
    unscoped: true,
    title: "Training days",
    blurb: "A calendar of the days you trained",
    needs: [],
    settings: {
      weeks: {
        label: "Weeks shown",
        options: [
          { value: 8, label: "8" },
          { value: 12, label: "12" },
          { value: 26, label: "26" },
        ],
        default: 12,
      },
    },
  },
  recovery: {
    kind: "fitness",
    unscoped: true,
    title: "Muscle recovery",
    blurb: "Which muscle groups are ready to train today",
    needs: ["muscle"],
    settings: {
      window: {
        label: "Recovering for",
        options: [
          { value: 2, label: "2 days" },
          { value: 3, label: "3 days" },
        ],
        default: 2,
      },
    },
  },
  fitnessKpis: {
    kind: "fitness",
    title: "Key numbers",
    blurb: "Sessions, sets, exercises and sets per session",
    needs: [],
    settings: {},
  },
  volume: {
    kind: "fitness",
    title: "Training volume",
    blurb: "Sets or sessions by week or month",
    needs: [],
    settings: {
      measure: {
        label: "Show",
        options: [
          { value: "sets", label: "Sets" },
          { value: "sessions", label: "Sessions" },
        ],
        default: "sets",
      },
    },
  },
  muscles: {
    kind: "fitness",
    title: "Sets by muscle",
    blurb: "Which muscle groups get the most sets",
    needs: ["muscle"],
    settings: {},
  },
  progress: {
    kind: "fitness",
    title: "Exercise progress",
    blurb: "First and latest load for each exercise",
    needs: ["load"],
    settings: {},
  },
  bodyWeight: {
    kind: "fitness",
    title: "Body weight",
    blurb: "Your weight over time",
    needs: ["bodyWeight"],
    settings: {},
  },
  recentSessions: {
    kind: "fitness",
    title: "Recent sessions",
    blurb: "Your latest workouts, with notes",
    needs: [],
    settings: {
      count: {
        label: "Sessions shown",
        options: [
          { value: 3, label: "3" },
          { value: 5, label: "5" },
          { value: 10, label: "10" },
        ],
        default: 3,
      },
    },
  },
} as const satisfies Record<
  string,
  {
    kind: SheetKind;
    /** About what's coming up or recent, not the selected period: the date range doesn't apply. */
    unscoped?: true;
    title: string;
    blurb: string;
    /** Column roles (of the widget's kind) it can't work without. */
    needs: readonly string[];
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

/** The widgets a sheet of this kind can show, in their default reading order. */
export const widgetTypesFor = (kind: SheetKind) =>
  WIDGET_TYPES.filter((t) => WIDGETS[t].kind === kind);

/** Whether the date range applies to this widget. */
export const isScoped = (type: WidgetType) => !("unscoped" in WIDGETS[type]);

/** The columns a widget needs that aren't mapped, if any. */
export const missingColumns = (type: WidgetType, mapping: SheetMapping): string[] =>
  WIDGETS[type].needs.filter((role) => !mapping[role]);

/** A setting's value, falling back to its default when unset or no longer valid. */
export function setting<T extends OptionValue>(widget: Widget, key: string): T {
  const def = (WIDGETS[widget.type].settings as Record<string, SettingDef>)[key];
  const value = widget.settings[key];
  return (def.options.some((o) => o.value === value) ? value : def.default) as T;
}

export const newWidget = (type: WidgetType): Widget => ({ id: type, type, settings: {} });

/** Every widget of the kind whose columns are mapped, in a sensible reading order. */
export function generateSpec(kind: SheetKind, mapping: SheetMapping): DashboardSpec {
  return {
    version: 3,
    widgets: widgetTypesFor(kind)
      .filter((type) => !missingColumns(type, mapping).length)
      .map(newWidget),
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

/**
 * Drop widgets of another kind, or whose columns are no longer mapped (e.g.
 * after editing the columns).
 */
export const fitSpec = (
  spec: DashboardSpec,
  kind: SheetKind,
  mapping: SheetMapping,
): DashboardSpec => ({
  version: 3,
  widgets: spec.widgets.filter(
    (w) => WIDGETS[w.type].kind === kind && !missingColumns(w.type, mapping).length,
  ),
});

/**
 * After the columns change: drop widgets that lost their column, and add the
 * ones a newly mapped column makes possible (e.g. body weight added later),
 * at the position they have in the default layout.
 */
export function refitSpec(
  spec: DashboardSpec,
  kind: SheetKind,
  before: SheetMapping,
  after: SheetMapping,
): DashboardSpec {
  const widgets = fitSpec(spec, kind, after).widgets;
  const order = widgetTypesFor(kind);
  for (const type of order) {
    const unlocked = missingColumns(type, before).length > 0 && !missingColumns(type, after).length;
    if (!unlocked || widgets.some((w) => w.type === type)) continue;
    // Just after the nearest widget that comes before it by default.
    const prior = order.slice(0, order.indexOf(type));
    const at = widgets.findLastIndex((w) => prior.includes(w.type)) + 1;
    widgets.splice(at, 0, newWidget(type));
  }
  return { version: 3, widgets };
}
