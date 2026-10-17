/**
 * Payday as a parent picks it, and as it's stored.
 *
 * The policy keeps one number: how many days after a period ends it's paid
 * (1 is the next morning — payroll runs at 1 a.m., so a period can't pay on
 * its own last day). For weekly and two-week schedules the settings page
 * shows that as a weekday plus a delay in weeks — "Saturday, right after
 * the period", "Friday, 1 week later" — and converts back here.
 */

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Week delays offered; a stored gap beyond this still shows as its own option. */
export const PAYDAY_DELAY_WEEKS = [0, 1, 2, 3];

/** Longest gap offered on a twice-a-month or monthly schedule. */
export const PAYDAY_MAX_DAYS = 14;

export function isWeekBased(cadence: string): boolean {
  return cadence === "weekly" || cadence === "biweekly";
}

/** The weekday and week delay a gap means, for periods starting on `periodStartDay`. */
export function weeklyPayday(
  offsetDays: number,
  periodStartDay: number,
): { weekday: number; delayWeeks: number } {
  const offset = Math.max(1, offsetDays);
  return {
    // A period ends the day before its start weekday; a gap of 1 lands on the start weekday.
    weekday: (periodStartDay + ((offset - 1) % 7)) % 7,
    delayWeeks: Math.floor((offset - 1) / 7),
  };
}

/** The gap for paying on `weekday`, `delayWeeks` after the first one once the period ends. */
export function weeklyOffset(weekday: number, delayWeeks: number, periodStartDay: number): number {
  return ((weekday - periodStartDay + 7) % 7) + 1 + 7 * delayWeeks;
}

/** "the next morning", "2 days after the period ends". */
export function describeGap(offsetDays: number): string {
  const offset = Math.max(1, offsetDays);
  return offset === 1 ? "the next morning" : `${offset} days after the period ends`;
}

/** One sentence for under the payday field: what the schedule works out to. */
export function describePayday(
  offsetDays: number,
  cadence: string,
  periodStartDay: number,
): string {
  const offset = Math.max(1, offsetDays);
  const gap = offset === 1 ? "the next morning" : `${offset} days after they end`;

  if (isWeekBased(cadence)) {
    const end = WEEKDAYS[(periodStartDay + 6) % 7];
    const { weekday } = weeklyPayday(offset, periodStartDay);
    const length = cadence === "biweekly" ? "Two-week periods" : "Periods";
    return offset === 1
      ? `${length} run ${WEEKDAYS[periodStartDay]} – ${end} and are paid the next morning, ${WEEKDAYS[weekday]}.`
      : `${length} run ${WEEKDAYS[periodStartDay]} – ${end} and are paid ${WEEKDAYS[weekday]}, ${gap}.`;
  }
  if (cadence === "semimonthly") {
    return `Periods run the 1st – 15th and the 16th – end of the month, paid ${gap}.`;
  }
  return `Each month is paid ${gap}.`;
}
