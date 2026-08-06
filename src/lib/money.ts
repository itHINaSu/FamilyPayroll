/**
 * Money primitives.
 *
 * Invariant I1: money is a signed integer count of cents, everywhere. Nothing in
 * this file returns a fractional value, and no caller should ever introduce one.
 * Interest is the sole exception and works in integer micro-cents (10^-6 cents),
 * rounding to cents exactly once, at monthly posting.
 */

/** Half away from zero, matching how a person rounds a receipt. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export type AllocationSplit<K extends string = string> = {
  key: K;
  pct: number;
};

/**
 * Split a net deposit across buckets so the parts sum to the whole exactly
 * (invariant I3).
 *
 * Each bucket takes its floor, then every leftover cent goes to `remainderKey` —
 * the bucket the parent designated for this child. Distributing leftovers by
 * largest fractional part would be marginally fairer in the abstract, but a
 * parent who chose "extra pennies go to Checking" should see them land in
 * Checking every single time. Predictability beats theoretical fairness when a
 * seven-year-old is reading the pay stub.
 */
export function allocate<K extends string>(
  totalCents: number,
  splits: readonly AllocationSplit<K>[],
  remainderKey: K,
): Record<K, number> {
  if (!Number.isInteger(totalCents)) {
    throw new Error(`allocate() requires integer cents, got ${totalCents}`);
  }
  if (splits.length === 0) {
    throw new Error("allocate() requires at least one split");
  }
  if (!splits.some((s) => s.key === remainderKey)) {
    throw new Error(`remainderKey "${remainderKey}" is not among the splits`);
  }

  const totalPct = splits.reduce((sum, s) => sum + s.pct, 0);
  if (totalPct !== 100) {
    throw new Error(`allocation percentages must total 100, got ${totalPct}`);
  }

  const result = {} as Record<K, number>;
  let assigned = 0;

  for (const split of splits) {
    // Truncate toward zero so a negative total cannot over-assign.
    const share = Math.trunc((totalCents * split.pct) / 100);
    result[split.key] = share;
    assigned += share;
  }

  result[remainderKey] += totalCents - assigned;

  return result;
}

/**
 * Earned pay for one expectation over one pay period.
 *
 * Proportional rather than per-occurrence: computing a per-occurrence value up
 * front and multiplying would accumulate rounding drift, and full completion
 * might pay $3.49 against a $3.50 weekly value. Doing the division once, here,
 * guarantees that completing everything pays exactly the stated amount.
 *
 * The displayed "$0.50 each" on the kiosk is therefore an approximation of this
 * calculation, not its source.
 */
export function earnedForExpectation(
  periodValueCents: number,
  completed: number,
  chances: number,
): number {
  if (chances <= 0) return 0; // fully excused: no chances, no potential (I8)
  const capped = Math.min(Math.max(completed, 0), chances);
  const earned = roundHalfUp((periodValueCents * capped) / chances);
  return Math.min(earned, periodValueCents); // invariant I9
}

/**
 * Scale a weekly value to a pay period of arbitrary length. A weekly schedule
 * scales by 1, biweekly by 2, and a monthly period by however many days it has.
 */
export function scaleWeeklyValue(
  weeklyValueCents: number,
  periodDays: number,
): number {
  if (periodDays === 7) return weeklyValueCents;
  return roundHalfUp((weeklyValueCents * periodDays) / 7);
}

const MICRO_PER_CENT = 1_000_000;

/** One day of interest, in integer micro-cents. */
export function dailyAccrualMicroCents(
  basisBalanceCents: number,
  annualRateBp: number,
): number {
  if (basisBalanceCents <= 0 || annualRateBp <= 0) return 0;
  return Math.trunc(
    (basisBalanceCents * annualRateBp * MICRO_PER_CENT) / 10_000 / 365,
  );
}

export function microCentsToCents(microCents: number): number {
  return roundHalfUp(microCents / MICRO_PER_CENT);
}

export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const formatted = `$${Math.trunc(abs / 100).toLocaleString("en-US")}.${String(
    abs % 100,
  ).padStart(2, "0")}`;
  return negative ? `-${formatted}` : formatted;
}

/** Parse user input ("12", "$12.50", "12.5") into integer cents. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === "-") {
    return null;
  }
  return roundHalfUp(Number(cleaned) * 100);
}
