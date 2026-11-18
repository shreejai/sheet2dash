"use client";

import { useId } from "react";
import { BODY_BACK, BODY_FRONT, type BodyPolygon } from "@/lib/body-outline";
import type { RecoveryRow } from "@/lib/workout-metrics";
import type { MuscleGroup } from "@/lib/workouts";

/*
 * Front and back body figures in a flat anatomy-chart style: slate muscles
 * with dark outlines (drawings: react-body-highlighter, MIT; see
 * lib/body-outline). Ready groups are green, recovering ones yellow with
 * stripes (so the two differ without colour), groups with no data stay the
 * body's base colour.
 */

const FIGURE_WIDTH = 100;
const FIGURE_HEIGHT = 220;
const GAP = 14;

/**
 * A closed polygon as a smooth curve through the same corners (Catmull-Rom
 * turned into cubic Béziers). A lower `tension` keeps the curve closer to
 * the original edges, so neighbouring muscles don't swell into each other.
 */
function smooth(points: string, inset = 0, tension = 0.15) {
  const n = points.trim().split(/\s+/).map(Number);
  let p: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]);
  if (inset > 0) {
    // Pull each corner a fixed distance towards the shape's centre, leaving
    // a thin strip of body colour between neighbouring muscles.
    const cx = p.reduce((t, [x]) => t + x, 0) / p.length;
    const cy = p.reduce((t, [, y]) => t + y, 0) / p.length;
    p = p.map(([x, y]) => {
      const len = Math.hypot(cx - x, cy - y);
      const k = len > inset * 2 ? inset / len : 0.4;
      return [x + (cx - x) * k, y + (cy - y) * k];
    });
  }
  const at = (i: number) => p[(i + p.length) % p.length];
  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M${r(p[0][0])} ${r(p[0][1])}`;
  for (let i = 0; i < p.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${r(p1[0] + (p2[0] - p0[0]) * tension)} ${r(p1[1] + (p2[1] - p0[1]) * tension)} ${r(p2[0] - (p3[0] - p1[0]) * tension)} ${r(p2[1] - (p3[1] - p1[1]) * tension)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return `${d}Z`;
}

/** `outline` is the full shape (for the silhouette), `d` the inset muscle. */
type Shape = { group: BodyPolygon["group"]; d: string; outline: string };
const MUSCLE_GAP = 0.7;
const toShapes = (polygons: BodyPolygon[]): Shape[] =>
  polygons.map(({ group, points }) => ({
    group,
    d: smooth(points, MUSCLE_GAP),
    outline: smooth(points),
  }));
const FRONT = toShapes(BODY_FRONT);
const BACK = toShapes(BODY_BACK);

const ago = (days: number) =>
  days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;

const WORD = { ready: "Ready", recovering: "Recovering", untrained: "Not logged" } as const;

/** What a hovered or tapped group says, in words. */
function describe(row: RecoveryRow) {
  if (row.status === "untrained") return `${row.group} · not in your log yet`;
  return [
    `${row.group} · ${WORD[row.status]}`,
    `trained ${ago(row.daysAgo!)}`,
    row.sets > 0 && `${row.sets} set${row.sets === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * `active` is the highlighted group, shared with the widget's list so hovering
 * a card lights up its muscles and hovering a muscle lights up its card.
 */
export function BodyMap({
  rows,
  active,
  setActive,
}: {
  rows: RecoveryRow[];
  active: MuscleGroup | null;
  setActive: (group: MuscleGroup | null) => void;
}) {
  const stripes = `stripes-${useId().replace(/:/g, "")}`;
  const byGroup = new Map(rows.map((r) => [r.group, r]));

  const fill = (status: RecoveryRow["status"] | undefined) =>
    status === "ready"
      ? "var(--body-ready)"
      : status === "recovering"
        ? `url(#${stripes})`
        : "var(--body-base)";

  const summary = (["ready", "recovering", "untrained"] as const)
    .map((s) => {
      const groups = rows.filter((r) => r.status === s).map((r) => r.group);
      return groups.length ? `${WORD[s]}: ${groups.join(", ")}` : null;
    })
    .filter(Boolean)
    .join(". ");

  const figure = (shapes: Shape[], x: number, label: string) => (
    <g transform={`translate(${x} 0)`}>
      {/* Silhouette: every shape again with a thick body-coloured edge, so the
          gaps between muscles fill in and the figure reads as one body. */}
      {shapes.map(({ outline }, i) => (
        <path
          key={`s${i}`}
          d={outline}
          style={{ fill: "var(--body-base)", stroke: "var(--body-base)" }}
          strokeWidth={3.5}
        />
      ))}
      {shapes.map(({ group, d }, i) => (
        <path
          key={i}
          d={d}
          style={{
            fill: fill(group ? byGroup.get(group)?.status : undefined),
            // The hovered group gets a bold outline in the text colour; the
            // rest fade back so it stands out in either theme.
            ...(active && group === active
              ? { stroke: "var(--foreground)" }
              : { opacity: active ? 0.35 : 1 }),
          }}
          strokeWidth={active && group === active ? 1.3 : 0.6}
          onMouseEnter={group ? () => setActive(group) : undefined}
          onClick={group ? () => setActive(group) : undefined}
          className={`motion-safe:transition-opacity ${group ? "cursor-pointer" : ""}`}
        />
      ))}
      <text
        x={FIGURE_WIDTH / 2}
        y={FIGURE_HEIGHT + 12}
        textAnchor="middle"
        stroke="none"
        style={{ fill: "var(--muted-foreground)", fontSize: 8 }}
      >
        {label}
      </text>
    </g>
  );

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox={`-2 -2 ${FIGURE_WIDTH * 2 + GAP + 4} ${FIGURE_HEIGHT + 18}`}
        role="img"
        aria-label={`Body map. ${summary}.`}
        className="w-full max-w-xs"
        stroke="var(--body-outline)"
        strokeLinejoin="round"
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <pattern
            id={stripes}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="4" height="4" style={{ fill: "var(--body-recovering)" }} stroke="none" />
            <rect width="1.2" height="4" style={{ fill: "var(--body-stripe)" }} stroke="none" />
          </pattern>
        </defs>
        {figure(FRONT, 0, "Front")}
        {figure(BACK, FIGURE_WIDTH + GAP, "Back")}
      </svg>

      <p aria-hidden className="min-h-4 text-center text-xs text-muted-foreground">
        {active && byGroup.get(active) ? describe(byGroup.get(active)!) : "Hover or tap a muscle"}
      </p>

      <ul
        className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
        aria-label="Legend"
      >
        {(["ready", "recovering", "untrained"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <svg viewBox="0 0 10 10" className="size-3" aria-hidden>
              <rect
                x="0.75"
                y="0.75"
                width="8.5"
                height="8.5"
                rx="2"
                style={{ fill: fill(s) }}
                stroke="var(--body-outline)"
                strokeWidth="1.5"
              />
            </svg>
            {WORD[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}
