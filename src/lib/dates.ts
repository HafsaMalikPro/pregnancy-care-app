/** Calendar-date helpers. API dates are plain "YYYY-MM-DD" strings with no time zone. */

const pad = (n: number) => String(n).padStart(2, "0");

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today in the browser's time zone. */
export const todayIso = () => toIsoDate(new Date());

function parse(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function formatDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  // Date-times are shown in local time; plain dates are never shifted by the zone.
  const date = iso.length > 10 ? new Date(iso) : parse(iso);
  return date.toLocaleDateString(undefined, options);
}

export const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
