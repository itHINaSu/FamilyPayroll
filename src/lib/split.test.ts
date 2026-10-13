import { describe, expect, it } from "vitest";

import { parsePercentToBp, resolveSplit } from "@/lib/split";

const sum = (parts: { amountCents: number }[]) => parts.reduce((n, p) => n + p.amountCents, 0);

describe("resolveSplit — percent", () => {
  it("splits exactly, leftover cents to the payroll bucket", () => {
    const result = resolveSplit(
      1001,
      "percent",
      [
        { account: "checking", value: "60" },
        { account: "savings", value: "30" },
        { account: "generosity", value: "10" },
      ],
      "savings",
    );
    if (!("parts" in result)) throw new Error(result.error);
    expect(result.parts).toEqual([
      { accountType: "checking", amountCents: 600 },
      { accountType: "savings", amountCents: 301 },
      { accountType: "generosity", amountCents: 100 },
    ]);
  });

  it("falls back to the first row when the bucket isn't in the split", () => {
    const result = resolveSplit(
      100,
      "percent",
      [
        { account: "savings", value: "33.33" },
        { account: "held", value: "66.67" },
      ],
      "checking",
    );
    if (!("parts" in result)) throw new Error(result.error);
    expect(sum(result.parts)).toBe(100);
    expect(result.parts[0]).toEqual({ accountType: "savings", amountCents: 34 });
  });

  it("requires exactly 100%", () => {
    const result = resolveSplit(
      1000,
      "percent",
      [
        { account: "checking", value: "50" },
        { account: "savings", value: "40" },
      ],
      "checking",
    );
    expect(result).toEqual({ error: "The percentages add up to 90%, not 100%." });
  });

  it("always sums to the total", () => {
    for (let total = 1; total < 400; total += 7) {
      const result = resolveSplit(
        total,
        "percent",
        [
          { account: "checking", value: "33.33" },
          { account: "savings", value: "33.33" },
          { account: "generosity", value: "33.34" },
        ],
        "generosity",
      );
      if ("parts" in result) expect(sum(result.parts)).toBe(total);
    }
  });
});

describe("resolveSplit — dollars", () => {
  it("accepts parts that add up to the total", () => {
    const result = resolveSplit(
      2000,
      "amount",
      [
        { account: "checking", value: "15" },
        { account: "savings", value: "$5.00" },
      ],
      "checking",
    );
    expect(result).toEqual({
      parts: [
        { accountType: "checking", amountCents: 1500 },
        { accountType: "savings", amountCents: 500 },
      ],
    });
  });

  it("says how far off a short split is", () => {
    const result = resolveSplit(
      2000,
      "amount",
      [
        { account: "checking", value: "15" },
        { account: "savings", value: "4" },
      ],
      "checking",
    );
    expect(result).toEqual({ error: "The split is $1.00 short of the total." });
  });

  it("refuses the same account twice", () => {
    const result = resolveSplit(
      2000,
      "amount",
      [
        { account: "checking", value: "10" },
        { account: "checking", value: "10" },
      ],
      "checking",
    );
    expect("error" in result).toBe(true);
  });
});

describe("parsePercentToBp", () => {
  it("parses up to two decimals and rejects over 100", () => {
    expect(parsePercentToBp("33.33")).toBe(3333);
    expect(parsePercentToBp("100%")).toBe(10000);
    expect(parsePercentToBp("100.01")).toBeNull();
    expect(parsePercentToBp("abc")).toBeNull();
  });
});
