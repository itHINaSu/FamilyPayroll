/**
 * Calendar arithmetic.
 *
 * Pay periods and bill due dates are dates on a wall calendar, not instants.
 * Everything here works in 'YYYY-MM-DD' strings and treats the container's
 * timezone as the household's, which is why TZ is a load-bearing variable rather
 * than a cosmetic one: a wrong clock silently shifts when children get paid.
 */

export type IsoDate = string;

export function todayInHousehold(now: Date = new Date()): IsoDate {
  return now.toLocaleDateString("en-CA"); // en-CA renders as YYYY-MM-DD
}

export function toIsoDate(date: Date): IsoDate {
  return date.toLocaleDateString("en-CA");
}

/** Parsed at midday so a daylight-saving shift cannot move the calendar day. */
export function fromIsoDate(iso: IsoDate): Date {
  return new Date(`${iso}T12:00:00`);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const d = fromIsoDate(iso);
  d.setMonth(d.getMonth() + months);
  return toIsoDate(d);
}

export function dayOfWeek(iso: IsoDate): number {
  return fromIsoDate(iso).getDay();
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = fromIsoDate(to).getTime() - fromIsoDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBetween(iso: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return iso >= start && iso <= end;
}

export function eachDate(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/**
 * Resolve a monthly due day onto a real date.
 *
 * A bill due on the 31st has no February date. Commercial practice is to move to
 * the following day rather than the preceding one, so `next_day` is the default;
 * `previous_day` keeps the charge inside the intended month.
 */
export function resolveMonthlyDueDate(
  year: number,
  month1to12: number,
  dueDay: number,
  rule: "next_day" | "previous_day",
): IsoDate {
  const available = daysInMonth(year, month1to12);
  const mm = String(month1to12).padStart(2, "0");

  if (dueDay <= available) {
    return `${year}-${mm}-${String(dueDay).padStart(2, "0")}`;
  }

  const lastOfMonth = `${year}-${mm}-${String(available).padStart(2, "0")}`;
  return rule === "previous_day" ? lastOfMonth : addDays(lastOfMonth, 1);
}

/**
 * The pay period containing a date.
 *
 * Pay date is deliberately separate from period end — that gap is what creates
 * the "earned but not yet paid" state, exactly as a real job does.
 */
export function payPeriodFor(
  onDate: IsoDate,
  opts: {
    cadence: "weekly" | "biweekly" | "semimonthly" | "monthly";
    periodStartDay: number;
    payDateOffsetDays: number;
    anchor?: IsoDate;
  },
): { startDate: IsoDate; endDate: IsoDate; payDate: IsoDate } {
  let startDate: IsoDate;
  let endDate: IsoDate;

  if (opts.cadence === "monthly") {
    const d = fromIsoDate(onDate);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    startDate = `${d.getFullYear()}-${mm}-01`;
    endDate = `${d.getFullYear()}-${mm}-${String(
      daysInMonth(d.getFullYear(), d.getMonth() + 1),
    ).padStart(2, "0")}`;
  } else if (opts.cadence === "semimonthly") {
    const d = fromIsoDate(onDate);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const last = daysInMonth(d.getFullYear(), d.getMonth() + 1);
    if (d.getDate() <= 15) {
      startDate = `${d.getFullYear()}-${mm}-01`;
      endDate = `${d.getFullYear()}-${mm}-15`;
    } else {
      startDate = `${d.getFullYear()}-${mm}-16`;
      endDate = `${d.getFullYear()}-${mm}-${String(last).padStart(2, "0")}`;
    }
  } else {
    const length = opts.cadence === "biweekly" ? 14 : 7;
    // Walk back to the most recent period-start weekday.
    let cursor = onDate;
    while (dayOfWeek(cursor) !== opts.periodStartDay) {
      cursor = addDays(cursor, -1);
    }
    if (length === 14) {
      // Fortnights line up with a fixed week (the first start weekday of
      // 2024 unless an anchor is given), so every day of one resolves to the
      // same period instead of each day starting its own.
      let anchor = opts.anchor ?? "2024-01-01";
      while (dayOfWeek(anchor) !== opts.periodStartDay) anchor = addDays(anchor, 1);
      const offset = ((daysBetween(anchor, cursor) % 14) + 14) % 14;
      if (offset !== 0) cursor = addDays(cursor, -offset);
    }
    startDate = cursor;
    endDate = addDays(cursor, length - 1);
  }

  return {
    startDate,
    endDate,
    payDate: addDays(endDate, opts.payDateOffsetDays),
  };
}

export function formatDateLong(iso: IsoDate, timezone: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 16", with the year only when it isn't this year. Display only. */
export function formatShortDate(iso: IsoDate, thisYear = new Date().getFullYear()): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${y === thisYear ? "" : `, ${y}`}`;
}

/** "Oct 5 – 11", "Sep 28 – Oct 4". Display only. */
export function formatDateRange(start: IsoDate, end: IsoDate): string {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const tail = sy === ey && sm === em ? String(ed) : formatShortDate(end);
  return `${formatShortDate(start)} – ${tail}`;
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
