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
  bodyWeightTrend,
  computeFitnessKpis,
  entriesIn,
  exerciseProgress,
  muscleRecovery,
  recentSessions,
  setsByMuscle,
  trainingCalendar,
  volumeTrend,
} from "@/lib/workout-metrics";
import type { BodyWeightEntry, WorkoutEntry } from "@/lib/workouts";
import { Card, CardContent } from "@/components/ui/card";
import {
  BodyWeightChart,
  FitnessKpiRow,
  MuscleChart,
  ProgressWidget,
  RecentSessions,
  RecoveryWidget,
  TrainingCalendar,
  VolumeChart,
} from "./fitness-widgets";
import { PeriodCard, usePeriod } from "./period-card";

const FULL_WIDTH = new Set<WidgetType>([
  "trainingDays",
  "recovery",
  "fitnessKpis",
  "volume",
  "progress",
]);

/** The workout dashboard: the same layout rules as the orders one, with workout widgets. */
export function FitnessView({
  entries,
  bodyWeights,
  hasSets,
  today,
  spec,
}: {
  entries: WorkoutEntry[];
  bodyWeights: BodyWeightEntry[];
  /** Whether the sheet has a sets column; without one, set figures are left out. */
  hasSets: boolean;
  /** Today in the app's timezone, from the server so both renders agree. */
  today: string;
  spec: DashboardSpec;
}) {
  const periodState = usePeriod(today);
  const { period } = periodState;
  const inPeriod = useMemo(() => entriesIn(entries, period.range), [entries, period.range]);

  // Widgets render in the owner's order. The period card goes just before the
  // first widget the date range applies to; if that's the key numbers, they
  // sit inside the period card.
  const firstScoped = spec.widgets.findIndex((w) => isScoped(w.type));
  const items: React.ReactNode[] = [];
  spec.widgets.forEach((w, i) => {
    if (i === firstScoped) {
      const merged = w.type === "fitnessKpis";
      items.push(
        <div key="period" className="min-w-0 lg:col-span-2">
          <PeriodCard state={periodState}>{merged && renderWidget(w)}</PeriodCard>
        </div>,
      );
      if (merged) return;
    }
    items.push(
      <div key={w.id} className={`min-w-0 ${FULL_WIDTH.has(w.type) ? "lg:col-span-2" : ""}`}>
        {w.type === "fitnessKpis" ? (
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
      case "trainingDays":
        return <TrainingCalendar weeks={trainingCalendar(entries, today, setting<number>(widget, "weeks"))} />;
      case "recovery": {
        const windowDays = setting<number>(widget, "window");
        return (
          <RecoveryWidget rows={muscleRecovery(entries, today, windowDays)} windowDays={windowDays} />
        );
      }
      case "fitnessKpis":
        return (
          <FitnessKpiRow
            current={computeFitnessKpis(entries, period.range)}
            comparisons={period.comparisons.map((comparison) => ({
              comparison,
              kpis: computeFitnessKpis(entries, comparison.range),
            }))}
            hasSets={hasSets}
            standalone={standalone}
          />
        );
      case "volume":
        return (
          <VolumeChart
            key={setting<string>(widget, "measure")}
            volume={volumeTrend(entries, period.range)}
            initialMeasure={setting<"sets" | "sessions">(widget, "measure")}
            hasSets={hasSets}
          />
        );
      case "muscles":
        return <MuscleChart rows={setsByMuscle(inPeriod)} hasSets={hasSets} />;
      case "progress":
        return <ProgressWidget rows={exerciseProgress(inPeriod)} />;
      case "bodyWeight":
        return <BodyWeightChart trend={bodyWeightTrend(bodyWeights, period.range)} />;
      case "recentSessions":
        return <RecentSessions sessions={recentSessions(inPeriod, setting<number>(widget, "count"))} />;
      default:
        return null; // an orders widget never reaches a workout dashboard (see fitSpec)
    }
  }
}
