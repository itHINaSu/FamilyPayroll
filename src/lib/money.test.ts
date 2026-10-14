import { describe, expect, it } from "vitest";

import {
  allocate,
  dailyAccrualMicroCents,
  earnedForResponsibility,
  formatCents,
  microCentsToCents,
  parseAmountToCents,
  roundHalfUp,
  scaleWeeklyValue,
} from "./money";

const SPLITS = [
  { key: "checking" as const, pct: 60 },
  { key: "savings" as const, pct: 20 },
  { key: "generosity" as const, pct: 20 },
];

describe("allocate — invariant I3", () => {
  it("splits an evenly divisible amount", () => {
    expect(allocate(1750, SPLITS, "checking")).toEqual({
      checking: 1050,
      savings: 350,
      generosity: 350,
    });
  });

  it("sends leftover cents to the designated bucket", () => {
    const result = allocate(1751, SPLITS, "checking");
    expect(result).toEqual({ checking: 1051, savings: 350, generosity: 350 });
  });

  it("honours a different designated bucket", () => {
    const result = allocate(1751, SPLITS, "savings");
    expect(result).toEqual({ checking: 1050, savings: 351, generosity: 350 });
  });

  it("always sums to the total, across a wide sweep", () => {
    for (let total = 0; total <= 5000; total++) {
      for (const remainder of ["checking", "savings", "generosity"] as const) {
        const parts = allocate(total, SPLITS, remainder);
        const sum = parts.checking + parts.savings + parts.generosity;
        expect(sum).toBe(total);
      }
    }
  });

  it("holds for awkward percentage splits", () => {
    const odd = [
      { key: "a" as const, pct: 33 },
      { key: "b" as const, pct: 33 },
      { key: "c" as const, pct: 34 },
    ];
    for (let total = 0; total <= 2000; total++) {
      const parts = allocate(total, odd, "a");
      expect(parts.a + parts.b + parts.c).toBe(total);
    }
  });

  it("rejects percentages that do not total 100", () => {
    expect(() =>
      allocate(100, [{ key: "a" as const, pct: 90 }], "a"),
    ).toThrow(/must total 100/);
  });

  it("rejects a remainder bucket that is not a split", () => {
    // The generic widens to include this key, so the runtime guard is what
    // actually protects against a typo'd or stale remainder bucket.
    expect(() => allocate(100, SPLITS, "held")).toThrow(/not among the splits/);
  });

  it("rejects fractional input", () => {
    expect(() => allocate(10.5, SPLITS, "checking")).toThrow(/integer cents/);
  });
});

describe("earnedForResponsibility — invariants I8 and I9", () => {
  it("pays the full weekly value for full completion", () => {
    expect(earnedForResponsibility(350, 7, 7)).toBe(350);
  });

  it("never exceeds the period value even with over-claimed completions", () => {
    expect(earnedForResponsibility(350, 99, 7)).toBe(350);
  });

  it("pays proportionally for partial completion", () => {
    expect(earnedForResponsibility(350, 5, 7)).toBe(250);
  });

  it("avoids drift on values that do not divide evenly", () => {
    // $2.00 across 3 chances: per-occurrence would be $0.66, and 3 x 66 = 198.
    expect(earnedForResponsibility(200, 3, 3)).toBe(200);
    expect(earnedForResponsibility(200, 1, 3)).toBe(67);
    expect(earnedForResponsibility(200, 2, 3)).toBe(133);
  });

  it("returns zero when every occurrence is excused", () => {
    expect(earnedForResponsibility(350, 0, 0)).toBe(0);
  });

  it("treats negative completions as zero", () => {
    expect(earnedForResponsibility(350, -3, 7)).toBe(0);
  });
});

describe("scaleWeeklyValue", () => {
  it("is identity for a weekly period", () => {
    expect(scaleWeeklyValue(350, 7)).toBe(350);
  });

  it("doubles for a fortnight", () => {
    expect(scaleWeeklyValue(350, 14)).toBe(700);
  });

  it("scales a 31-day month", () => {
    expect(scaleWeeklyValue(350, 31)).toBe(1550);
  });
});

describe("interest accrual", () => {
  it("keeps sub-cent daily accrual that cent-rounding would destroy", () => {
    // $5.00 at 12% APR earns $0.60/year, so 0.164 cents a day. Rounding each
    // day to cents would pay this child nothing, forever.
    const daily = dailyAccrualMicroCents(500, 1200);
    expect(daily).toBe(164_383);
    expect(microCentsToCents(daily)).toBe(0);
    expect(microCentsToCents(daily * 30)).toBe(5); // a month is worth 5 cents
  });

  it("accrues a full month correctly on a larger balance", () => {
    // $40.00 at 12% APR: 1.315 cents a day, ~39 cents over 30 days.
    const daily = dailyAccrualMicroCents(4000, 1200);
    expect(daily).toBe(1_315_068);
    expect(microCentsToCents(daily * 30)).toBe(39);
  });

  it("accrues nothing on an empty or negative balance", () => {
    expect(dailyAccrualMicroCents(0, 1200)).toBe(0);
    expect(dailyAccrualMicroCents(-500, 1200)).toBe(0);
  });

  it("accrues nothing when the rate is zero", () => {
    expect(dailyAccrualMicroCents(4000, 0)).toBe(0);
  });
});

describe("roundHalfUp", () => {
  it("rounds halves away from zero in both directions", () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(-2.6)).toBe(-3);
  });
});

describe("formatCents", () => {
  it("formats positive, negative, zero, and thousands", () => {
    expect(formatCents(1750)).toBe("$17.50");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-1234)).toBe("-$12.34");
    expect(formatCents(123456)).toBe("$1,234.56");
  });
});

describe("parseAmountToCents", () => {
  it("accepts the shapes a parent actually types", () => {
    expect(parseAmountToCents("12")).toBe(1200);
    expect(parseAmountToCents("12.5")).toBe(1250);
    expect(parseAmountToCents("$12.50")).toBe(1250);
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents(" 3.07 ")).toBe(307);
  });

  it("rejects junk and over-precise input", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("1.234")).toBeNull();
    expect(parseAmountToCents("-")).toBeNull();
  });
});

describe("formatCentsCompact", () => {
  it("drops .00 on whole dollars only", async () => {
    const { formatCentsCompact } = await import("@/lib/money");
    expect(formatCentsCompact(2200)).toBe("$22");
    expect(formatCentsCompact(1629)).toBe("$16.29");
    expect(formatCentsCompact(-500)).toBe("-$5");
    expect(formatCentsCompact(0)).toBe("$0");
  });
});
