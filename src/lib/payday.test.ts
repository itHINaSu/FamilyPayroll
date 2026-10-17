import { describe, expect, it } from "vitest";

import { describePayday, weeklyOffset, weeklyPayday } from "@/lib/payday";

const SAT = 6;
const SUN = 0;
const MON = 1;
const FRI = 5;

describe("payday as a weekday", () => {
  it("reads a stored gap as a weekday and a week delay", () => {
    // Saturday – Friday periods.
    expect(weeklyPayday(1, SAT)).toEqual({ weekday: SAT, delayWeeks: 0 });
    expect(weeklyPayday(2, SAT)).toEqual({ weekday: SUN, delayWeeks: 0 });
    expect(weeklyPayday(7, SAT)).toEqual({ weekday: FRI, delayWeeks: 0 });
    expect(weeklyPayday(8, SAT)).toEqual({ weekday: SAT, delayWeeks: 1 });
    expect(weeklyPayday(14, SAT)).toEqual({ weekday: FRI, delayWeeks: 1 });
    // An old 0 pays the next morning in practice, so it reads as that.
    expect(weeklyPayday(0, SAT)).toEqual({ weekday: SAT, delayWeeks: 0 });
  });

  it("turns a weekday and delay back into the same gap", () => {
    for (const start of [SUN, MON, SAT]) {
      for (let gap = 1; gap <= 28; gap++) {
        const { weekday, delayWeeks } = weeklyPayday(gap, start);
        expect(weeklyOffset(weekday, delayWeeks, start)).toBe(gap);
      }
    }
  });

  it("pays Friday a week after a Friday end, not the same day", () => {
    expect(weeklyOffset(FRI, 0, SAT)).toBe(7);
    expect(weeklyOffset(FRI, 1, SAT)).toBe(14);
  });

  it("says what the schedule works out to", () => {
    expect(describePayday(1, "weekly", SAT)).toBe(
      "Periods run Saturday – Friday and are paid the next morning, Saturday.",
    );
    expect(describePayday(9, "weekly", SAT)).toBe(
      "Periods run Saturday – Friday and are paid Sunday, 9 days after they end.",
    );
    expect(describePayday(1, "monthly", SAT)).toBe("Each month is paid the next morning.");
  });
});
