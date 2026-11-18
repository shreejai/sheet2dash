// Finds a tab's header row. Pure (no server-only imports) so it can be tested directly.

import type { CellValue } from "./sheets";

const SCAN_ROWS = 30;

const isBlank = (v: CellValue | undefined) => v === undefined || v === "";

/**
 * Index of the row holding the column headers, or -1 for an empty tab.
 *
 * Usually row 1, but some sheets put a title, notes or a summary band above
 * the table. The header row is the first one that is mostly text (numbers
 * and real dates arrive as numbers), with at least two filled cells and at
 * least half as many as the widest row near the top, which rules out a title
 * (one cell) or a small summary band. If no row fits, the first non-blank
 * row is used, as before.
 */
export function findHeaderRow(values: CellValue[][]): number {
  const firstFilled = values.findIndex((row) => row.some((v) => !isBlank(v)));
  if (firstFilled === -1) return -1;

  const top = values.slice(0, firstFilled + SCAN_ROWS);
  const filled = (row: CellValue[]) => row.filter((v) => !isBlank(v));
  const widest = Math.max(...top.map((row) => filled(row).length));

  const header = top.findIndex((row) => {
    const cells = filled(row);
    if (cells.length < 2 || cells.length < widest / 2) return false;
    const text = cells.filter((v) => typeof v === "string" && Number.isNaN(Number(v.trim())));
    return text.length >= cells.length * 0.8;
  });
  return header === -1 ? firstFilled : header;
}
