"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MergedRow } from "@/lib/google/sheets";
import { formatAud, formatCount, formatDate, formatTime } from "@/lib/format";
import { parseOrders } from "@/lib/orders";
import { KINDS, roleKeys, type SheetKind, type SheetMapping } from "@/lib/sheet-kinds";
import { formatLoad, formatReps, parseWorkouts } from "@/lib/workouts";
import { saveColumnMapping } from "./actions";

export function ColumnForm({
  sheetId,
  kind,
  headers,
  rows,
  initial,
  editing,
}: {
  sheetId: string;
  kind: SheetKind;
  headers: string[];
  rows: MergedRow[];
  initial: SheetMapping;
  /** Editing a saved mapping (shows Cancel) rather than confirming for the first time. */
  editing: boolean;
}) {
  const [mapping, setMapping] = useState<SheetMapping>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const { roles } = KINDS[kind];
  const keys = roleKeys(kind);
  const required = keys.filter((r) => roles[r].required);
  const missingRequired = required.some((r) => !mapping[r]);

  // Live preview: re-parse the rows whenever a column choice changes.
  const preview = useMemo(
    () =>
      kind === "fitness"
        ? workoutsPreview(headers, rows, mapping)
        : ordersPreview(headers, rows, mapping),
    [kind, headers, rows, mapping],
  );

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveColumnMapping(sheetId, kind, mapping);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {keys.map((role) => {
          const { label, hint, required } = roles[role];
          const id = `column-${role}`;
          return (
            <div key={role} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-medium">
                {label}
                {required && <span className="text-destructive"> *</span>}
              </label>
              <select
                id={id}
                value={mapping[role] ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, [role]: e.target.value || undefined }))}
                className="h-9 rounded-lg bg-fill px-2.5 text-base outline-none pointer-coarse:h-11 sm:text-sm focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <option value="">{required ? "Choose a column…" : "Not in my sheet"}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          );
        })}
      </div>

      <section className="flex flex-col gap-2" aria-live="polite">
        <h2 className="headline">Preview</h2>
        {missingRequired ? (
          <p className="text-sm text-muted-foreground">
            Choose the {required.map((r) => roles[r].label.toLowerCase()).join(" and ")} columns to
            see a preview.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <strong>{preview.summary}</strong> will be used
              {preview.skipped.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {formatCount(preview.skipped.reduce((n, [count]) => n + count, 0))} rows
                  skipped (
                  {preview.skipped.map(([count, why]) => `${count} with no ${why}`).join(", ")})
                </span>
              )}
            </p>
            {preview.rows.length > 0 && (
              <div className="overflow-x-auto rounded-xl bg-background/60">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground shadow-[0_0.5px_0_var(--separator)]">
                    <tr>
                      {preview.columns.map(({ label, numeric }) => (
                        <th
                          key={label}
                          className={`px-3 py-2 font-medium ${numeric ? "text-right" : ""}`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator">
                    {preview.rows.map((cells, i) => (
                      <tr key={i}>
                        {cells.map((cell, c) => (
                          <td
                            key={c}
                            className={
                              preview.columns[c].numeric
                                ? "px-3 py-2 text-right whitespace-nowrap tabular-nums"
                                : preview.columns[c].wide
                                  ? "max-w-56 truncate px-3 py-2"
                                  : "px-3 py-2 whitespace-nowrap"
                            }
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving || missingRequired || preview.count === 0}>
          {saving ? "Saving…" : "Looks right — build my dashboard"}
        </Button>
        {editing && (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={`/dashboard/${sheetId}`} />}
          >
            Cancel
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

type Preview = {
  count: number;
  summary: string;
  /** [how many, "due date"] pairs, only for non-zero counts. */
  skipped: [number, string][];
  columns: { label: string; numeric?: boolean; wide?: boolean }[];
  /** The five most recent rows, as display text. */
  rows: string[][];
};

const nonZero = (pairs: [number, string][]) => pairs.filter(([n]) => n > 0);

function ordersPreview(headers: string[], rows: MergedRow[], mapping: SheetMapping): Preview {
  const { orders, skipped } = parseOrders(headers, rows, mapping);
  const recent = [...orders].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 5);
  return {
    count: orders.length,
    summary: `${formatCount(orders.length)} orders`,
    skipped: nonZero([
      [skipped.noDate, "due date"],
      [skipped.noAmount, "amount"],
    ]),
    columns: [
      { label: "Due" },
      { label: "Pickup" },
      { label: "Cake", wide: true },
      { label: "Customer" },
      { label: "Amount", numeric: true },
    ],
    rows: recent.map((o) => [
      formatDate(o.dueDate),
      formatTime(o.pickupMinutes) || "—",
      o.cakeType ?? "—",
      o.customer ?? "—",
      formatAud(o.amount),
    ]),
  };
}

function workoutsPreview(headers: string[], rows: MergedRow[], mapping: SheetMapping): Preview {
  const { entries, bodyWeights, skipped } = parseWorkouts(headers, rows, mapping);
  const sessions = new Set(entries.map((e) => e.date)).size;
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return {
    count: entries.length + bodyWeights.length,
    summary: [
      `${formatCount(entries.length)} exercises over ${formatCount(sessions)} sessions`,
      bodyWeights.length > 0 && `${formatCount(bodyWeights.length)} body-weight readings`,
    ]
      .filter(Boolean)
      .join(" and "),
    skipped: nonZero([
      [skipped.noDate, "date"],
      [skipped.noExercise, "exercise"],
    ]),
    columns: [
      { label: "Date" },
      { label: "Exercise", wide: true },
      { label: "Sets", numeric: true },
      { label: "Reps", numeric: true },
      { label: "Load" },
      { label: "Day" },
    ],
    rows: recent.map((e) => [
      formatDate(e.date),
      e.exercise,
      e.sets === null ? "—" : String(e.sets),
      formatReps(e.reps),
      formatLoad(e.load, e.loadText),
      e.dayType ?? "—",
    ]),
  };
}
