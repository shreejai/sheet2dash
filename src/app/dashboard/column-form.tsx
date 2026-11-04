"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MergedRow } from "@/lib/google/sheets";
import { formatAud, formatCount, formatDate, formatTime } from "@/lib/format";
import { ROLES, ROLE_KEYS, parseOrders, type ColumnMapping } from "@/lib/orders";
import { saveColumnMapping } from "./actions";

export function ColumnForm({
  headers,
  rows,
  initial,
  editing,
}: {
  headers: string[];
  rows: MergedRow[];
  initial: ColumnMapping;
  /** Editing a saved mapping (shows Cancel) rather than confirming for the first time. */
  editing: boolean;
}) {
  const [mapping, setMapping] = useState<ColumnMapping>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Live preview: re-parse the rows whenever a column choice changes.
  const { orders, skipped } = useMemo(
    () => parseOrders(headers, rows, mapping),
    [headers, rows, mapping],
  );
  const recent = useMemo(
    () => [...orders].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 5),
    [orders],
  );
  const missingRequired = ROLE_KEYS.some((r) => ROLES[r].required && !mapping[r]);
  const skippedTotal = skipped.noDate + skipped.noAmount;

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveColumnMapping(mapping);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {ROLE_KEYS.map((role) => {
          const { label, hint, required } = ROLES[role];
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
            Choose the due date and amount columns to see a preview.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <strong>{formatCount(orders.length)} orders</strong> will be used
              {skippedTotal > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {formatCount(skippedTotal)} rows skipped (
                  {[
                    skipped.noDate && `${skipped.noDate} with no due date`,
                    skipped.noAmount && `${skipped.noAmount} with no amount`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  )
                </span>
              )}
            </p>
            {recent.length > 0 && (
              <div className="overflow-x-auto rounded-xl bg-background/60">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground shadow-[0_0.5px_0_var(--separator)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Due</th>
                      <th className="px-3 py-2 font-medium">Pickup</th>
                      <th className="px-3 py-2 font-medium">Cake</th>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator">
                    {recent.map((o, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(o.dueDate)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatTime(o.pickupMinutes) || "—"}
                        </td>
                        <td className="max-w-56 truncate px-3 py-2">{o.cakeType ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{o.customer ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatAud(o.amount)}</td>
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
        <Button onClick={save} disabled={saving || missingRequired || orders.length === 0}>
          {saving ? "Saving…" : "Looks right — build my dashboard"}
        </Button>
        {editing && (
          <Button variant="ghost" nativeButton={false} render={<Link href="/dashboard" />}>
            Cancel
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
