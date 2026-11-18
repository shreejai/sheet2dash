"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, CircleCheck, CircleDashed, Hourglass } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { WEEKDAYS, shortDate } from "@/lib/dates";
import { formatCount, formatDate } from "@/lib/format";
import {
  OTHER_MUSCLE,
  type BodyWeightTrend,
  type ExerciseProgress,
  type FitnessKpis,
  type MuscleRow,
  type RecoveryRow,
  type Session,
  type TrainingWeek,
  type Volume,
} from "@/lib/workout-metrics";
import type { Comparison } from "@/lib/metrics";
import { formatLoad, formatReps, type Load, type MuscleGroup } from "@/lib/workouts";
import {
  Empty,
  TableView,
  TileRow,
  Tip,
  Toggle,
  WidgetCard,
  niceTicks,
  plural,
  type Tile,
} from "./widgets";
import { BodyMap } from "./body-map";

const NO_WORKOUTS = "No workouts in this period.";
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-AU");

// ---------------------------------------------------------------------------
// Key numbers

export function FitnessKpiRow({
  current,
  comparisons,
  hasSets,
  standalone = false,
}: {
  current: FitnessKpis;
  comparisons: { comparison: Comparison; kpis: FitnessKpis }[];
  /** Without a sets column, the set figures are left out. */
  hasSets: boolean;
  standalone?: boolean;
}) {
  const tiles: Tile<FitnessKpis>[] = [
    {
      label: "Sessions",
      value: formatCount(current.sessions),
      pick: (k) => k.sessions,
      unit: "%",
    },
    ...(hasSets
      ? [
          {
            label: "Sets",
            value: formatCount(current.sets),
            pick: (k: FitnessKpis) => k.sets,
            unit: "%" as const,
          },
        ]
      : []),
    {
      label: "Exercises",
      value: formatCount(current.exercises),
      pick: (k) => k.exercises,
      unit: "%",
    },
    ...(hasSets
      ? [
          {
            label: "Sets per session",
            value: current.setsPerSession === null ? "—" : oneDecimal(current.setsPerSession),
            pick: (k: FitnessKpis) => k.setsPerSession,
            unit: "%" as const,
          },
        ]
      : []),
  ];
  return (
    <TileRow tiles={tiles} current={current} comparisons={comparisons} standalone={standalone} />
  );
}

// ---------------------------------------------------------------------------
// Training days

const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A grid of the last few weeks, a column per week and a row per weekday,
 * like a contributions calendar: filled squares are days you trained.
 */
type Hovered = {
  day: TrainingWeek["days"][number];
  weekday: number;
  /** Centre-top of the square, relative to the grid. */
  x: number;
  y: number;
  /** Where the card hangs from the square, so it stays inside the card at the edges. */
  align: "start" | "center" | "end";
};

export function TrainingCalendar({ weeks }: { weeks: TrainingWeek[] }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const thisWeek = weeks.at(-1)!;
  const total = weeks.reduce((n, w) => n + w.sessions, 0);
  const lastTrained = weeks
    .flatMap((w) => w.days)
    .filter((d) => d.exercises > 0)
    .at(-1);

  return (
    <WidgetCard
      label={`Training days · last ${weeks.length} weeks`}
      value={plural(thisWeek.sessions, "session") + " this week"}
      detail={
        total > 0 ? (
          <>
            Average{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {oneDecimal(total / weeks.length)}
            </span>{" "}
            a week
            {lastTrained && ` · last trained ${shortDate(lastTrained.date)}`}
          </>
        ) : (
          `No sessions in the last ${weeks.length} weeks`
        )
      }
    >
      <div className="flex gap-2">
        {/* Weekday labels; every other one, so they stay legible at small sizes. */}
        <div
          aria-hidden
          className="grid shrink-0 grid-rows-[auto_repeat(7,1fr)] gap-[3px] text-caption text-muted-foreground"
        >
          <span className="h-4" />
          {WEEKDAYS.map((d, i) => (
            <span key={d} className="flex items-center leading-none">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        <div
          role="group"
          aria-label="Days trained"
          className="relative grid min-w-0 flex-1 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          onMouseLeave={() => setHovered(null)}
        >
          {weeks.map((week, w) => {
            const month = Number(week.start.slice(5, 7)) - 1;
            const newMonth = w === 0 || Number(weeks[w - 1].start.slice(5, 7)) - 1 !== month;
            return (
              <div key={week.start} className="grid grid-rows-[auto_repeat(7,1fr)] gap-[3px]">
                <span aria-hidden className="h-4 overflow-visible text-caption whitespace-nowrap text-muted-foreground">
                  {newMonth ? MONTHS[month] : ""}
                </span>
                {week.days.map((day, d) => {
                  const trained = day.exercises > 0;
                  const label = `${FULL_DAYS[d]} ${shortDate(day.date)}: ${
                    day.future
                      ? "still to come"
                      : trained
                        ? [day.dayTypes.join(", "), plural(day.exercises, "exercise"), day.sets && plural(day.sets, "set")]
                            .filter(Boolean)
                            .join(" · ")
                        : "rest day"
                  }`;
                  // Hover, tap or focus shows the day's card, like a chart's tooltip.
                  const show = (e: React.SyntheticEvent<HTMLButtonElement>) => {
                    const cell = e.currentTarget.getBoundingClientRect();
                    const grid = e.currentTarget.closest("[role=group]")!.getBoundingClientRect();
                    const x = cell.left + cell.width / 2 - grid.left;
                    setHovered({
                      day,
                      weekday: d,
                      x,
                      y: cell.top - grid.top,
                      align: x < grid.width * 0.25 ? "start" : x > grid.width * 0.75 ? "end" : "center",
                    });
                  };
                  const active = hovered?.day.date === day.date;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      aria-label={label}
                      onMouseEnter={show}
                      onFocus={show}
                      onClick={show}
                      onBlur={() => setHovered(null)}
                      className={`aspect-square max-h-6 w-full rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                        trained
                          ? "bg-chart-1"
                          : day.future
                            ? "shadow-[inset_0_0_0_1px_var(--separator)]"
                            : "bg-fill"
                      } ${active ? "ring-2 ring-foreground/40" : ""}`}
                    />
                  );
                })}
              </div>
            );
          })}
          {hovered && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10"
              style={{
                left: hovered.x,
                top: hovered.y - 6,
                transform: `translate(${
                  hovered.align === "start" ? "-12px" : hovered.align === "end" ? "calc(-100% + 12px)" : "-50%"
                }, -100%)`,
              }}
            >
              <Tip
                title={`${FULL_DAYS[hovered.weekday]} ${shortDate(hovered.day.date)}`}
                rows={
                  hovered.day.future
                    ? [{ label: "", value: "Still to come" }]
                    : hovered.day.exercises === 0
                      ? [{ label: "", value: "Rest day" }]
                      : [
                          ...(hovered.day.dayTypes.length
                            ? [{ label: "", value: hovered.day.dayTypes.join(", ") }]
                            : []),
                          { label: hovered.day.exercises === 1 ? "exercise" : "exercises", value: formatCount(hovered.day.exercises) },
                          ...(hovered.day.sets
                            ? [{ label: hovered.day.sets === 1 ? "set" : "sets", value: formatCount(hovered.day.sets) }]
                            : []),
                        ]
                }
              />
            </div>
          )}
        </div>
      </div>
      <TableView
        head={["Week starting", "Sessions", "Sets"]}
        rows={[...weeks]
          .reverse()
          .map((w) => [
            formatDate(w.start),
            formatCount(w.sessions),
            formatCount(w.days.reduce((n, d) => n + d.sets, 0)),
          ])}
      />
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Muscle recovery

const ago = (days: number) => (days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`);

const STATUS = {
  ready: { word: "Ready", Icon: CircleCheck, className: "text-chart-good" },
  recovering: { word: "Recovering", Icon: Hourglass, className: "text-recovering" },
  untrained: { word: "Not logged", Icon: CircleDashed, className: "text-muted-foreground" },
} as const;

/**
 * Which muscle groups were trained in the last few days, and which are
 * ready. Status is an icon and a word, never colour alone.
 */
export function RecoveryWidget({ rows, windowDays }: { rows: RecoveryRow[]; windowDays: number }) {
  const logged = rows.filter((r) => r.status !== "untrained");
  const ready = logged.filter((r) => r.status === "ready");
  const untrained = rows.filter((r) => r.status === "untrained");
  const [active, setActive] = useState<MuscleGroup | null>(null);

  return (
    <WidgetCard
      label="Muscle recovery · today"
      value={logged.length ? `${ready.length} of ${logged.length} ready` : undefined}
      detail={
        logged.length
          ? ready.length
            ? `Ready to train: ${ready.map((r) => r.group).join(", ")}`
            : "Everything you've logged was trained in the last few days"
          : undefined
      }
      footnote={`Trained today${windowDays > 2 ? `, yesterday or the day before` : " or yesterday"} counts as recovering. It can't see how hard a session was, and an exercise that works two groups counts for both: a guide, not medical advice.`}
    >
      {logged.length ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
          <div className="shrink-0 lg:w-72">
            <BodyMap rows={rows} active={active} setActive={setActive} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
          <ul className="grid gap-x-6 sm:grid-cols-2" onMouseLeave={() => setActive(null)}>
            {logged.map((r) => {
              const { word, Icon, className } = STATUS[r.status];
              return (
                <li
                  key={r.group}
                  onMouseEnter={() => setActive(r.group)}
                  onClick={() => setActive(active === r.group ? null : r.group)}
                  className={`-mx-2 flex cursor-default items-start justify-between gap-3 rounded-lg px-2 py-2.5 shadow-[0_-0.5px_0_var(--separator)] motion-safe:transition-colors ${
                    active === r.group ? "bg-fill" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.group}</p>
                    <p className="text-xs text-muted-foreground">
                      {`Trained ${ago(r.daysAgo!)}`}
                      {r.sets > 0 && ` · ${plural(r.sets, "set")}`}
                      {r.readyOn &&
                        ` · ready ${
                          windowDays - r.daysAgo! === 1
                            ? "tomorrow"
                            : WEEKDAYS[(new Date(`${r.readyOn}T00:00:00Z`).getUTCDay() + 6) % 7]
                        }`}
                    </p>
                    {r.exercises.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">{r.exercises.join(", ")}</p>
                    )}
                  </div>
                  <span className={`flex shrink-0 items-center gap-1 text-sm font-medium ${className}`}>
                    <Icon className="size-4" aria-hidden />
                    {word}
                  </span>
                </li>
              );
            })}
          </ul>
          {untrained.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Not in your log yet: {untrained.map((r) => r.group).join(", ")}
            </p>
          )}
          </div>
        </div>
      ) : (
        <Empty>No muscle groups recognised in your target-muscle column yet.</Empty>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Training volume

const VOLUME_MEASURES = { sets: "Sets", sessions: "Sessions" } as const;
type VolumeMeasure = keyof typeof VOLUME_MEASURES;

export function VolumeChart({
  volume,
  initialMeasure = "sets",
  hasSets,
}: {
  volume: Volume;
  initialMeasure?: VolumeMeasure;
  hasSets: boolean;
}) {
  const [chosen, setBy] = useState<VolumeMeasure>(initialMeasure);
  const by: VolumeMeasure = hasSets ? chosen : "sessions";
  const total = volume.points.reduce((n, p) => n + p[by], 0);
  const hasData = volume.points.some((p) => p.sessions > 0);
  const ticks = niceTicks(Math.max(...volume.points.map((p) => p[by])));
  const years = new Set(volume.points.map((p) => p.label.match(/\d{4}$/)?.[0]));
  const tick = (label: string) => (years.size === 1 ? label.replace(/ \d{4}$/, "") : label);
  const word = by === "sets" ? "set" : "session";

  return (
    <WidgetCard
      label={`Training volume · ${by} by ${volume.bucket}`}
      value={plural(total, word)}
      detail={
        volume.points.length > 0 &&
        `Average ${oneDecimal(total / volume.points.length)} a ${volume.bucket}`
      }
      action={
        hasSets && (
          <Toggle label="Measure" value={by} options={VOLUME_MEASURES} onChange={setBy} />
        )
      }
      footnote={
        by === "sets" ? "Rows without a number of sets count as a session, not as sets." : undefined
      }
    >
      {hasData ? (
        <>
          <ChartContainer
            config={{ [by]: { label: VOLUME_MEASURES[by], color: "var(--chart-1)" } }}
            className="aspect-auto h-56 w-full"
          >
            <BarChart data={volume.points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={8}
                tickFormatter={tick}
              />
              <YAxis
                orientation="right"
                width={40}
                tickLine={false}
                axisLine={false}
                ticks={ticks}
                domain={[0, ticks[ticks.length - 1]]}
                allowDecimals={false}
                className="tabular-nums"
              />
              <ChartTooltip
                cursor={{ fill: "var(--fill)", radius: 6 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <Tip
                      title={`${volume.bucket === "week" ? "Week of " : ""}${label}`}
                      rows={[
                        ...(hasSets
                          ? [{ label: "sets", value: formatCount(payload[0].payload.sets) }]
                          : []),
                        { label: "sessions", value: formatCount(payload[0].payload.sessions) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar
                dataKey={by}
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
          <TableView
            head={[
              volume.bucket === "week" ? "Week starting" : "Month",
              ...(hasSets ? ["Sets"] : []),
              "Sessions",
            ]}
            rows={volume.points.map((p) => [
              p.label,
              ...(hasSets ? [formatCount(p.sets)] : []),
              formatCount(p.sessions),
            ])}
          />
        </>
      ) : (
        <Empty>{NO_WORKOUTS}</Empty>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Sets by muscle

export function MuscleChart({ rows, hasSets }: { rows: MuscleRow[]; hasSets: boolean }) {
  const by = hasSets ? "sets" : "exercises";
  const leader = rows.find((r) => r.name !== OTHER_MUSCLE);
  const sum = rows.reduce((n, r) => n + r[by], 0);
  return (
    <WidgetCard
      label={hasSets ? "Sets by muscle" : "Exercises by muscle"}
      value={leader?.name}
      detail={
        leader &&
        sum > 0 && (
          <>
            <span className="font-semibold text-foreground tabular-nums">
              {Math.round((leader[by] / sum) * 100)}%
            </span>
            of {by} · {plural(leader[by], by.slice(0, -1))}
          </>
        )
      }
      footnote="Grouped from the target muscle. An exercise that works two groups counts towards both."
    >
      {rows.length ? (
        <>
          <ChartContainer
            config={{ value: { label: hasSets ? "Sets" : "Exercises", color: "var(--chart-1)" } }}
            className="aspect-auto w-full"
            style={{ height: rows.length * 36 + 8 }}
          >
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
              <XAxis type="number" dataKey={by} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={84}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <ChartTooltip
                cursor={{ fill: "var(--fill)", radius: 6 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <Tip
                      title={String(payload[0].payload.name)}
                      rows={[
                        ...(hasSets
                          ? [{ label: "sets", value: formatCount(payload[0].payload.sets) }]
                          : []),
                        {
                          label: "exercises logged",
                          value: formatCount(payload[0].payload.exercises),
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
                    fill={r.name === OTHER_MUSCLE ? "var(--chart-2)" : "var(--chart-1)"}
                  />
                ))}
                <LabelList
                  dataKey={by}
                  position="right"
                  className="fill-foreground tabular-nums"
                  formatter={(v: unknown) => formatCount(Number(v))}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          <TableView
            head={["Muscle group", ...(hasSets ? ["Sets"] : []), "Exercises logged"]}
            rows={rows.map((r) => [
              r.name,
              ...(hasSets ? [formatCount(r.sets)] : []),
              formatCount(r.exercises),
            ])}
          />
        </>
      ) : (
        <Empty>{NO_WORKOUTS}</Empty>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Exercise progress

/** "+2 kg", "+1 level", "−0.5 kg". */
function formatChange(change: number, load: Load | null) {
  const amount = oneDecimal(Math.abs(change));
  const unit =
    load?.unit === "stack" ? (Math.abs(change) === 1 ? " level" : " levels") : " kg";
  return `${change > 0 ? "+" : change < 0 ? "−" : ""}${amount}${unit}`;
}

function ChangeCell({ row }: { row: ExerciseProgress }) {
  if (row.change === null) return <span className="text-muted-foreground">—</span>;
  if (row.change === 0) return <span className="text-muted-foreground">Same</span>;
  const up = row.change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium ${up ? "text-chart-good" : "text-chart-bad"}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatChange(row.change, row.latest.load)}
    </span>
  );
}

const loadAndReps = (p: ExerciseProgress["first"]) =>
  [formatLoad(p.load, null), p.reps && `× ${formatReps(p.reps)}`]
    .filter((s) => s && s !== "—")
    .join(" ") || "—";

/**
 * Each exercise's first and latest session, and a chart of one exercise's
 * load over time. Loads are compared only within one unit, so a cable
 * exercise's stack level is never set against kilograms.
 */
export function ProgressWidget({ rows }: { rows: ExerciseProgress[] }) {
  const charted = rows.filter((r) => r.history.length > 1);
  const [key, setKey] = useState(charted[0]?.key ?? "");
  const selected = charted.find((r) => r.key === key) ?? charted[0];
  const compared = rows.filter((r) => r.change !== null);
  const up = compared.filter((r) => r.change! > 0).length;

  return (
    <WidgetCard
      label="Exercise progress · first and latest session"
      value={
        compared.length ? `${up} of ${plural(compared.length, "exercise")} up` : plural(rows.length, "exercise")
      }
      detail={
        compared.length
          ? "Load in the latest session compared with the first"
          : "Log an exercise twice with a weight or stack level to see its progress"
      }
      footnote="Bodyweight and loads like “Light Stack” can't be compared, so they show —."
    >
      {rows.length ? (
        <>
          {selected && (
            <div className="flex flex-col gap-2">
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Chart</span>
                <select
                  value={selected.key}
                  onChange={(e) => setKey(e.target.value)}
                  className="h-9 max-w-full min-w-0 rounded-lg bg-fill px-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/60 pointer-coarse:h-11 sm:text-sm"
                >
                  {charted.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <LoadChart row={selected} />
            </div>
          )}
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="shadow-[0_0.5px_0_var(--separator)]">
                  <th className="py-2 pr-3 font-medium">Exercise</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">First</th>
                  <th className="px-3 py-2 font-medium">Latest</th>
                  <th className="py-2 pl-3 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2.5 pr-3">
                      {r.name}
                      <span className="block text-xs text-muted-foreground">
                        {plural(r.sessions, "session")} · last {shortDate(r.latest.date)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                      {loadAndReps(r.first)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{loadAndReps(r.latest)}</td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap tabular-nums">
                      <ChangeCell row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty>{NO_WORKOUTS}</Empty>
      )}
    </WidgetCard>
  );
}

function LoadChart({ row }: { row: ExerciseProgress }) {
  const stack = row.latest.load?.unit === "stack";
  const format = (v: number) => (stack ? `Stack ${oneDecimal(v)}` : `${oneDecimal(v)} kg`);
  const data = row.history.map((h) => ({ ...h, label: shortDate(h.date) }));
  const ticks = niceTicks(Math.max(...data.map((d) => d.top)));
  return (
    <ChartContainer
      config={{ top: { label: stack ? "Stack level" : "Load (kg)", color: "var(--chart-1)" } }}
      className="aspect-auto h-44 w-full"
    >
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
        <YAxis
          orientation="right"
          width={52}
          tickLine={false}
          axisLine={false}
          ticks={ticks}
          domain={[0, ticks[ticks.length - 1]]}
          tickFormatter={(v: number) => (stack ? `${v}` : `${v} kg`)}
          className="tabular-nums"
        />
        <ChartTooltip
          cursor={{ stroke: "var(--separator)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <Tip
                title={formatDate(String(payload[0].payload.date))}
                rows={[{ label: row.name, value: format(Number(payload[0].payload.top)) }]}
              />
            ) : null
          }
        />
        <Line
          dataKey="top"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

// ---------------------------------------------------------------------------
// Recent sessions

export function RecentSessions({ sessions }: { sessions: Session[] }) {
  const latest = sessions[0];
  return (
    <WidgetCard
      label="Recent sessions"
      value={latest ? shortDate(latest.date) : undefined}
      detail={
        latest &&
        [latest.dayTypes.join(", "), plural(latest.entries.length, "exercise"), latest.sets && plural(latest.sets, "set")]
          .filter(Boolean)
          .join(" · ")
      }
    >
      {sessions.length ? (
        <ol className="flex flex-col gap-4">
          {sessions.map((s) => (
            <li key={s.date} className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">
                {FULL_DAYS[(new Date(`${s.date}T00:00:00Z`).getUTCDay() + 6) % 7]}{" "}
                {shortDate(s.date)}
                {s.dayTypes.length > 0 && (
                  <span className="font-normal text-muted-foreground"> · {s.dayTypes.join(", ")}</span>
                )}
              </h3>
              <ul className="divide-y divide-separator rounded-xl bg-background/60 text-sm">
                {s.entries.map((e, i) => (
                  <li key={i} className="flex flex-col gap-0.5 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">{e.exercise}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {[
                          e.sets !== null && e.reps
                            ? `${e.sets} × ${formatReps(e.reps)}`
                            : e.sets !== null
                              ? plural(e.sets, "set")
                              : e.reps
                                ? `${formatReps(e.reps)} reps`
                                : null,
                          e.loadText && formatLoad(e.load, e.loadText),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>{NO_WORKOUTS}</Empty>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Body weight

export function BodyWeightChart({ trend }: { trend: BodyWeightTrend }) {
  const data = trend.points.map((p) => ({ ...p, label: shortDate(p.date) }));
  const values = data.map((d) => d.kg);
  // Body weight moves within a few kg: a zero baseline would flatten it.
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  return (
    <WidgetCard
      label="Body weight"
      value={trend.latest === null ? undefined : `${oneDecimal(trend.latest)} kg`}
      detail={
        trend.change !== null && trend.points.length > 1
          ? `${trend.change > 0 ? "+" : trend.change < 0 ? "−" : ""}${oneDecimal(Math.abs(trend.change))} kg since ${shortDate(trend.points[0].date)}`
          : trend.latest !== null
            ? `On ${shortDate(trend.points[0].date)}`
            : undefined
      }
      footnote="The axis starts near your lowest reading, not at zero, so small changes show."
    >
      {data.length ? (
        <>
          <ChartContainer
            config={{ kg: { label: "Body weight (kg)", color: "var(--chart-1)" } }}
            className="aspect-auto h-48 w-full"
          >
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
              <YAxis
                orientation="right"
                width={52}
                tickLine={false}
                axisLine={false}
                domain={[lo, hi]}
                allowDecimals={false}
                tickFormatter={(v: number) => `${v} kg`}
                className="tabular-nums"
              />
              <ChartTooltip
                cursor={{ stroke: "var(--separator)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <Tip
                      title={formatDate(String(payload[0].payload.date))}
                      rows={[{ label: "body weight", value: `${oneDecimal(Number(payload[0].payload.kg))} kg` }]}
                    />
                  ) : null
                }
              />
              <Line
                dataKey="kg"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
          <TableView
            head={["Date", "Body weight"]}
            rows={[...trend.points].reverse().map((p) => [formatDate(p.date), `${oneDecimal(p.kg)} kg`])}
          />
        </>
      ) : (
        <Empty>No body-weight readings in this period.</Empty>
      )}
    </WidgetCard>
  );
}
