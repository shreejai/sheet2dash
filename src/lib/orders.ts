// Turns raw merged sheet rows into typed orders. Pure: runs on server and client.

import type { CellValue } from "./google/sheets";

export const ROLES = {
  dueDate: { label: "Due date", required: true, hint: "When the order is picked up" },
  amount: { label: "Amount charged", required: true, hint: "What the customer paid (AUD)" },
  pickupTime: { label: "Pickup time", required: false, hint: "Time on the due date" },
  cakeType: { label: "Cake type", required: false, hint: "What was ordered" },
  customer: { label: "Customer", required: false, hint: "Customer name" },
} as const;

export type Role = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as Role[];

/** Role → header label as written in the sheet. */
export type ColumnMapping = Partial<Record<Role, string>>;

export type Order = {
  /** ISO date, YYYY-MM-DD. */
  dueDate: string;
  /** Minutes after midnight, or null if not given. */
  pickupMinutes: number | null;
  amount: number;
  cakeType: string | null;
  customer: string | null;
  /** Trimmed + lower-cased, for counting repeat customers. */
  customerKey: string | null;
  tab: string;
};

export type ParseResult = {
  orders: Order[];
  skipped: { noDate: number; noAmount: number };
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// Detection

const PATTERNS: Record<Role, RegExp[]> = {
  dueDate: [/\bdue\b.*\bdate\b/, /\bdue\b/, /\b(pick ?up|delivery|collection) date\b/],
  amount: [/\bcharged\b/, /\b(amount|price|paid|revenue)\b/],
  pickupTime: [/\bpick ?up time\b/, /\b(pick ?up|collection|delivery)\b/, /\btime\b/],
  cakeType: [/\bcake\b/, /\btype\b/, /\b(item|product|order|flavou?r)\b/],
  customer: [/\bcustomer\b/, /\bname\b/, /\bclient\b/],
};

/**
 * Best guess for each role from the header names. Each header is used at most
 * once; roles are matched in order of how specific their patterns are.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const role of ["dueDate", "pickupTime", "amount", "customer", "cakeType"] as Role[]) {
    for (const pattern of PATTERNS[role]) {
      const hit = headers.find((h) => !used.has(h) && pattern.test(norm(h)));
      if (hit) {
        mapping[role] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Value parsing

const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

const isoFromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Sheets serial number or DD/MM/YYYY text → YYYY-MM-DD. */
export function parseDate(v: CellValue): string | null {
  if (typeof v === "number") {
    // Plausible range: 1950–2100, so stray amounts aren't read as dates.
    if (v < 18_264 || v > 73_051) return null;
    return isoFromUtc(SHEETS_EPOCH + Math.floor(v) * DAY_MS);
  }
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const [day, month] = [Number(m[1]), Number(m[2])];
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null; // e.g. 31/02
  return isoFromUtc(ms);
}

/** 120, "120", "$120", "A$1,200.50" → number. Blank or text → null. */
export function parseAmount(v: CellValue): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/(a\$|aud|\$|,|\s)/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const WORD_TIMES: Record<string, number> = {
  morning: 9 * 60,
  midday: 12 * 60,
  noon: 12 * 60,
  lunch: 12 * 60,
  afternoon: 15 * 60,
  evening: 18 * 60,
  night: 19 * 60,
};

/**
 * Time of day → minutes after midnight. Handles Sheets time fractions (0.4375),
 * "10am", "2:30 pm", "14:00", ranges like "5:30-6pm" (takes the start), and
 * words like "Morning".
 */
export function parseTime(v: CellValue): number | null {
  if (typeof v === "number") {
    const fraction = v - Math.floor(v);
    if (fraction === 0 && v !== 0) return null;
    return Math.round(fraction * 24 * 60);
  }
  if (typeof v !== "string") return null;
  const s = norm(v).replace(/\./g, "");
  if (!s) return null;
  if (s in WORD_TIMES) return WORD_TIMES[s];

  // Start of a range; am/pm may only be written on the end ("5:30-6pm").
  const [start, end = ""] = s.split(/\s*(?:-|–|to)\s*/);
  const m = start.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  const meridiem = m[3] ?? end.match(/(am|pm)$/)?.[1];
  if (hours > 23 || minutes > 59) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  // No am/pm and a small hour: a cake shop's "5:30" means the afternoon.
  if (!meridiem && hours >= 1 && hours <= 7) hours += 12;
  return hours * 60 + minutes;
}

const text = (v: CellValue | undefined) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

// ---------------------------------------------------------------------------

/** Applies a mapping to merged rows. Rows without a due date or amount are skipped. */
export function parseOrders(
  headers: string[],
  rows: { tab: string; values: CellValue[] }[],
  mapping: ColumnMapping,
): ParseResult {
  const index = (role: Role) => (mapping[role] ? headers.indexOf(mapping[role]) : -1);
  const col = Object.fromEntries(ROLE_KEYS.map((r) => [r, index(r)])) as Record<Role, number>;
  const at = (values: CellValue[], role: Role) => (col[role] === -1 ? "" : values[col[role]]);

  const orders: Order[] = [];
  const skipped = { noDate: 0, noAmount: 0 };
  for (const { tab, values } of rows) {
    const dueDate = parseDate(at(values, "dueDate") ?? "");
    if (!dueDate) {
      skipped.noDate += 1;
      continue;
    }
    const amount = parseAmount(at(values, "amount") ?? "");
    if (amount === null) {
      skipped.noAmount += 1;
      continue;
    }
    const customer = text(at(values, "customer"));
    orders.push({
      dueDate,
      pickupMinutes: parseTime(at(values, "pickupTime") ?? ""),
      amount,
      cakeType: text(at(values, "cakeType")),
      customer,
      customerKey: customer ? norm(customer) : null,
      tab,
    });
  }
  return { orders, skipped };
}

/** True if the mapping names every required role, using columns that exist. */
export function isCompleteMapping(mapping: ColumnMapping, headers: string[]) {
  return ROLE_KEYS.every((role) => {
    const h = mapping[role];
    if (!h) return !ROLES[role].required;
    return headers.includes(h);
  });
}
