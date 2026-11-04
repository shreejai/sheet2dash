import "server-only";

// Read-only access to the Google Sheets API. The app never writes to the sheet.

const API = "https://sheets.googleapis.com/v4/spreadsheets";

/** A raw cell value. Dates arrive as serial numbers (days since 30/12/1899). */
export type CellValue = string | number | boolean;

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function google<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new GoogleApiError(res.status, body?.error?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

type SpreadsheetMeta = {
  properties: { title: string };
  sheets: { properties: { title: string; sheetType?: string } }[];
};

/** Title and grid tab names. Also proves the user's token can open this file. */
export async function getSpreadsheetMeta(spreadsheetId: string, token: string) {
  const fields = "properties.title,sheets.properties(title,sheetType)";
  const meta = await google<SpreadsheetMeta>(
    `${API}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(fields)}`,
    token,
  );
  return {
    title: meta.properties.title,
    tabs: meta.sheets
      .filter((s) => (s.properties.sheetType ?? "GRID") === "GRID")
      .map((s) => s.properties.title),
  };
}

export type TabSummary = {
  title: string;
  /** Non-blank data rows (excluding the header row). */
  rowCount: number;
  included: boolean;
  note?: string;
};

export type MergedRow = { tab: string; values: CellValue[] };

export type MergedSheet = {
  title: string;
  /** Column headers as written in the sheet, in the order of the reference tab. */
  headers: string[];
  /** Every data row from every included tab, values aligned to `headers`. */
  rows: MergedRow[];
  tabs: TabSummary[];
};

const normalise = (h: CellValue | undefined) =>
  String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const isBlank = (v: CellValue | undefined) => v === undefined || v === "";

/**
 * Reads every tab and merges the "year" tabs into one dataset.
 *
 * Tabs named like a year are merged; columns are matched by name, so order and
 * blank spacer columns may differ between years. A column missing from one
 * year (e.g. no pickup time in 2022) is left blank for that year's rows.
 * Skipped tabs are reported with a reason.
 */
export async function fetchMergedSheet(spreadsheetId: string, token: string): Promise<MergedSheet> {
  const { title, tabs } = await getSpreadsheetMeta(spreadsheetId, token);

  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
    majorDimension: "ROWS",
  });
  // A bare quoted tab name selects the whole tab. Quotes inside are doubled.
  for (const tab of tabs) params.append("ranges", `'${tab.replaceAll("'", "''")}'`);

  const { valueRanges } = await google<{ valueRanges: { values?: CellValue[][] }[] }>(
    `${API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`,
    token,
  );

  const parsed = tabs.map((tab, i) => {
    const values = valueRanges[i]?.values ?? [];
    const headerIndex = values.findIndex((row) => row.some((v) => !isBlank(v)));
    if (headerIndex === -1) return { tab, headers: [] as string[], rows: [] as CellValue[][] };
    const headers = values[headerIndex].map((h) => String(h ?? "").trim());
    while (headers.length && !headers.at(-1)) headers.pop();
    const rows = values.slice(headerIndex + 1).filter((row) => row.some((v) => !isBlank(v)));
    return { tab, headers, rows };
  });

  // Only year tabs ("2023") hold orders; other tabs (e.g. "Expenses") are left out.
  // If nothing is named like a year, fall back to every non-empty tab.
  const isYear = (t: string) => /^(19|20)\d{2}$/.test(t.trim());
  const withHeaders = parsed.filter((p) => p.headers.length);
  const candidates = withHeaders.some((p) => isYear(p.tab))
    ? withHeaders.filter((p) => isYear(p.tab))
    : withHeaders;

  // Columns drift a little from year to year, and some tabs keep side tables
  // (like an expenses list) to the right of the orders. Keep a column only if
  // at least half of the year tabs have it.
  const headerCount = new Map<string, { label: string; tabs: number }>();
  for (const p of candidates) {
    for (const h of new Set(p.headers.filter(Boolean))) {
      const key = normalise(h);
      const entry = headerCount.get(key) ?? { label: h, tabs: 0 };
      entry.tabs += 1;
      headerCount.set(key, entry);
    }
  }
  const minTabs = Math.ceil(candidates.length / 2);
  const kept = [...headerCount.entries()].filter(([, e]) => e.tabs >= minTabs);
  const wanted = kept.map(([key]) => key);
  const headers = kept.map(([, e]) => e.label);

  const rows: MergedRow[] = [];
  const summaries: TabSummary[] = parsed.map((p) => {
    if (!p.headers.length) {
      return { title: p.tab, rowCount: 0, included: false, note: "Empty tab" };
    }
    if (!candidates.includes(p)) {
      return { title: p.tab, rowCount: p.rows.length, included: false, note: "Not a year tab" };
    }
    // indexOf takes the first match, so a repeated side-table header can't win.
    const own = p.headers.map(normalise);
    const columnIndex = wanted.map((h) => own.indexOf(h));
    const missing = wanted.filter((_, i) => columnIndex[i] === -1);
    if (missing.length > wanted.length / 2) {
      return {
        title: p.tab,
        rowCount: p.rows.length,
        included: false,
        note: "Columns don't match the other tabs",
      };
    }

    let rowCount = 0;
    for (const row of p.rows) {
      const values = columnIndex.map((c) => (c === -1 ? "" : (row[c] ?? "")));
      // Rows that only fill a side table are blank once aligned to the order columns.
      if (values.every(isBlank)) continue;
      rows.push({ tab: p.tab, values });
      rowCount += 1;
    }
    return {
      title: p.tab,
      rowCount,
      included: true,
      note: missing.length
        ? `No ${missing.map((m) => `"${headerCount.get(m)!.label}"`).join(", ")} column`
        : undefined,
    };
  });

  return { title, headers, rows, tabs: summaries };
}
