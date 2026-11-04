// Calendar maths on ISO dates (YYYY-MM-DD). Everything is done in UTC so a
// date never shifts by a day because of the viewer's timezone.

/** The business's timezone, used to decide what "today" is. */
export const TIMEZONE = "Australia/Sydney";

export type DateRange = { from: string; to: string };

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

/** Today's date in the business's timezone. */
export function todayIso(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

export const addDays = (iso: string, days: number) => fromMs(toMs(iso) + days * DAY);

export const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY);

/** Adds months, clamping the day (31 Mar − 1 month → 28/29 Feb). */
export function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromMs(target.getTime());
}

export const addYears = (iso: string, years: number) => addMonths(iso, years * 12);

export const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;
export const endOfMonth = (iso: string) => addDays(addMonths(startOfMonth(iso), 1), -1);
export const startOfYear = (iso: string) => `${iso.slice(0, 4)}-01-01`;
export const endOfYear = (iso: string) => `${iso.slice(0, 4)}-12-31`;

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (iso: string) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;

/** The Monday on or before the date (weeks start Monday). */
export const startOfWeek = (iso: string) => addDays(iso, -weekdayIndex(iso));

export const inRange = (iso: string, r: DateRange) => iso >= r.from && iso <= r.to;

export const sameRange = (a: DateRange, b: DateRange) => a.from === b.from && a.to === b.to;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Mar" or "5 Mar 2025". */
export function shortDate(iso: string, withYear = false) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** "Mar 2025" */
export const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
