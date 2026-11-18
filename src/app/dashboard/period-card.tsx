"use client";

import { useMemo, useState } from "react";
import { addDays, shortDate, type DateRange } from "@/lib/dates";
import { PRESETS, resolvePeriod, type Period, type PresetId } from "@/lib/metrics";
import { SegmentedControl } from "@/components/segmented-control";
import { Card, CardContent } from "@/components/ui/card";

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

export type PeriodState = ReturnType<typeof usePeriod>;

/** The selected date range (default: this year) and what it's compared against. */
export function usePeriod(today: string) {
  const [preset, setPreset] = useState<PresetId>("year");
  const [custom, setCustom] = useState<DateRange>({ from: addDays(today, -89), to: today });
  const period: Period = useMemo(
    () => resolvePeriod(preset, today, custom),
    [preset, today, custom],
  );
  return { preset, setPreset, custom, setCustom, period };
}

/**
 * The period card, styled like the pickups calendar: the period in large
 * type with its dates, the range control beside it, and (when given) the key
 * numbers below a hairline.
 */
export function PeriodCard({ state, children }: { state: PeriodState; children?: React.ReactNode }) {
  const { preset, setPreset, custom, setCustom, period } = state;
  const sameYear = period.range.from.slice(0, 4) === period.range.to.slice(0, 4);
  const rangeLabel = `${shortDate(period.range.from, !sameYear)} – ${shortDate(period.range.to, true)}`;

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
        {children}
      </CardContent>
    </Card>
  );
}
