// en-AU display helpers: A$1,234 · 05/03/2025 · 2:30 pm

const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 });

export const formatAud = (n: number) => `${n < 0 ? "-" : ""}A$${number.format(Math.abs(n))}`;

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
