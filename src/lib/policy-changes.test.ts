/**
 * Settings changes that start on a chosen date: this pay period or the next.
 * Real SQLite file, real migrations.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-policy-"));
  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { db } = await import("@/db");
const schema = await import("@/db/schema");
const { resolvePolicy, savePolicyChanges, scheduledVersionDates, getOverrides } = await import(
  "@/lib/policy"
);

function household() {
  return db
    .insert(schema.household)
    .values({ name: `Test ${crypto.randomUUID().slice(0, 6)}`, timezone: "UTC" })
    .returning({ id: schema.household.id })
    .get().id;
}

describe("savePolicyChanges", () => {
  it("leaves the current period alone when a change starts next period", () => {
    const h = household();
    savePolicyChanges({
      scopeType: "household",
      scopeId: h,
      changes: [{ kind: "set", path: "allocation.checkingPct", value: 50 }],
      effectiveFrom: "2026-10-19",
    });

    expect(resolvePolicy(h, null, "2026-10-18").allocation.checkingPct).toBe(60);
    expect(resolvePolicy(h, null, "2026-10-19").allocation.checkingPct).toBe(50);
    expect(scheduledVersionDates("household", h, "2026-10-14")).toEqual(["2026-10-19"]);
  });

  it("applies from the start of this period when chosen", () => {
    const h = household();
    savePolicyChanges({
      scopeType: "household",
      scopeId: h,
      changes: [{ kind: "set", path: "interest.enabled", value: false }],
      effectiveFrom: "2026-10-12",
    });
    expect(resolvePolicy(h, null, "2026-10-12").interest.enabled).toBe(false);
    expect(resolvePolicy(h, null, "2026-10-11").interest.enabled).toBe(true);
  });

  it("carries a change made now into one already scheduled, instead of being undone by it", () => {
    const h = household();
    // Scheduled first: next period's split.
    savePolicyChanges({
      scopeType: "household",
      scopeId: h,
      changes: [{ kind: "set", path: "allocation.checkingPct", value: 50 }],
      effectiveFrom: "2026-10-19",
    });
    // Then, for this period: interest off.
    savePolicyChanges({
      scopeType: "household",
      scopeId: h,
      changes: [{ kind: "set", path: "interest.enabled", value: false }],
      effectiveFrom: "2026-10-12",
    });

    const thisPeriod = resolvePolicy(h, null, "2026-10-14");
    expect(thisPeriod.interest.enabled).toBe(false);
    expect(thisPeriod.allocation.checkingPct).toBe(60);

    const nextPeriod = resolvePolicy(h, null, "2026-10-19");
    expect(nextPeriod.interest.enabled).toBe(false); // not undone
    expect(nextPeriod.allocation.checkingPct).toBe(50); // still scheduled
  });

  it("adds to what's already scheduled for the same date", () => {
    const h = household();
    for (const [p, v] of [
      ["allocation.checkingPct", 50],
      ["allocation.savingsPct", 40],
    ] as const) {
      savePolicyChanges({
        scopeType: "household",
        scopeId: h,
        changes: [{ kind: "set", path: p, value: v }],
        effectiveFrom: "2026-10-19",
      });
    }
    const next = resolvePolicy(h, null, "2026-10-19").allocation;
    expect(next.checkingPct).toBe(50);
    expect(next.savingsPct).toBe(40);
  });

  it("returns a child's section to the family's rules", () => {
    const h = household();
    const childId = db
      .insert(schema.child)
      .values({ householdId: h, displayName: "Sam", birthdate: "2016-01-01", status: "active" })
      .returning({ id: schema.child.id })
      .get().id;

    savePolicyChanges({
      scopeType: "child",
      scopeId: childId,
      changes: [{ kind: "set", path: "allocation.checkingPct", value: 80 }],
      effectiveFrom: "2026-10-12",
    });
    expect(resolvePolicy(h, childId, "2026-10-14").allocation.checkingPct).toBe(80);

    savePolicyChanges({
      scopeType: "child",
      scopeId: childId,
      changes: [{ kind: "removeSection", section: "allocation" }],
      effectiveFrom: "2026-10-19",
    });
    expect(resolvePolicy(h, childId, "2026-10-18").allocation.checkingPct).toBe(80);
    expect(resolvePolicy(h, childId, "2026-10-19").allocation.checkingPct).toBe(60);
    expect(getOverrides("child", childId, "2026-10-19")).toEqual({});
  });
});
