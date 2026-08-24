export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Toronto";

/** e.g. "8:42 PM" in cottage time. */
export function formatClock(date: Date, tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(date);
}

/** e.g. "Monday" */
export function formatWeekday(date: Date | string, tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: tz }).format(
    toDate(date),
  );
}

/** e.g. "Monday, August 24" */
export function formatLongDate(date: Date | string, tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: tz,
  }).format(toDate(date));
}

/** Today's calendar date in cottage time, as YYYY-MM-DD (matches SQL `date`). */
export function cottageToday(now: Date = new Date(), tz: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** "just now" / "47 minutes ago" / "3 hours ago" / "2 days ago" */
export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const then = toDate(date);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return ago(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ago(hours, "hour");
  const days = Math.round(hours / 24);
  return ago(days, "day");
}

function ago(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/**
 * A `date` column comes back as "YYYY-MM-DD". Parsing that with `new Date()`
 * would treat it as UTC midnight and can shift the weekday, so anchor it at
 * noon UTC — safely inside the cottage day for any North American offset.
 */
function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`);
  return new Date(value);
}

/** Milliseconds `tz` is ahead of UTC at the given instant. */
function timeZoneOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/**
 * Format an instant as a `datetime-local` input value in cottage time, so the
 * Edit sheet shows the same wall clock the rest of the app does regardless of
 * where the phone thinks it is.
 */
export function toCottageInputValue(date: Date, tz: string = APP_TIMEZONE): string {
  const shifted = new Date(date.getTime() + timeZoneOffsetMs(date, tz));
  return shifted.toISOString().slice(0, 16);
}

/** Inverse of `toCottageInputValue` — interprets "YYYY-MM-DDTHH:mm" as cottage time. */
export function fromCottageInputValue(value: string, tz: string = APP_TIMEZONE): Date {
  const naive = new Date(`${value}:00.000Z`);
  if (Number.isNaN(naive.getTime())) return new Date(NaN);

  const firstGuess = new Date(naive.getTime() - timeZoneOffsetMs(naive, tz));
  // Re-check across a DST boundary, where the first guess can land in the
  // wrong offset by an hour.
  const refinedOffset = timeZoneOffsetMs(firstGuess, tz);
  return new Date(naive.getTime() - refinedOffset);
}
