// en-AU display helpers: A$1,234 · 05/03/2025 · 2:30 pm

const whole = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A$1,234 for whole dollars, A$152.50 otherwise. */
export function formatAud(n: number) {
  const rounded = Math.round(Math.abs(n) * 100) / 100;
  return `${n < 0 ? "-" : ""}A$${(Number.isInteger(rounded) ? whole : cents).format(rounded)}`;
}

export const formatCount = (n: number) => n.toLocaleString("en-AU");

/** YYYY-MM-DD → DD/MM/YYYY */
export const formatDate = (iso: string) => iso.split("-").reverse().join("/");

export function formatTime(minutes: number | null) {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}
