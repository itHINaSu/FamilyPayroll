/**
 * A child added later gets every family-wide responsibility, and none of
 * the ones created for a single child.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-newchild-"));
  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const schema = await import("@/db/schema");
const { createChild } = await import("@/lib/children");
const {
  createResponsibilityTemplate,
  createResponsibilityTemplateForChild,
  instantiateTemplatesForChild,
  setTemplateAppliesToNewChildren,
} = await import("@/lib/responsibilities");

const input = (name: string) => ({ name, weeklyValueCents: 500, cadence: "daily" as const });

function namesFor(childId: string) {
  return db
    .select({ name: schema.responsibility.name })
    .from(schema.responsibility)
    .where(eq(schema.responsibility.childId, childId))
    .all()
    .map((r) => r.name)
    .sort();
}

it("gives a new child the all-children responsibilities only", () => {
  const householdId = db
    .insert(schema.household)
    .values({ name: "New child test" })
    .returning({ id: schema.household.id })
    .get().id;
  const oldest = createChild({ householdId, displayName: "Oldest", birthdate: "2012-01-01", status: "active" });

  createResponsibilityTemplate(householdId, input("Make your bed"));
  createResponsibilityTemplateForChild(householdId, oldest, input("Mow the lawn"), false);
  createResponsibilityTemplateForChild(householdId, oldest, input("Dishes"), true);
  const toggled = createResponsibilityTemplateForChild(householdId, oldest, input("Laundry"), false);
  setTemplateAppliesToNewChildren(householdId, toggled.id, true);

  const baby = createChild({ householdId, displayName: "Baby", birthdate: "2020-01-01", status: "active" });
  instantiateTemplatesForChild(householdId, baby);

  expect(namesFor(baby)).toEqual(["Dishes", "Laundry", "Make your bed"]);
  expect(namesFor(oldest)).toEqual(["Dishes", "Laundry", "Make your bed", "Mow the lawn"]);
});

it("attaches one-child expectations to Setup: by name, or as a new one-child entry", async () => {
  const { adoptOrphans } = await import("@/lib/adopt");
  const householdId = db
    .insert(schema.household)
    .values({ name: "Adopt test" })
    .returning({ id: schema.household.id })
    .get().id;
  const kid = createChild({ householdId, displayName: "Kid", birthdate: "2014-01-01", status: "active" });
  const family = createResponsibilityTemplate(householdId, input("Make your bed"));

  const orphan = (name: string, cents: number) =>
    db
      .insert(schema.responsibility)
      .values({ childId: kid, name, weeklyValueCents: cents, cadence: "daily", effectiveFrom: "2026-01-01" })
      .returning({ id: schema.responsibility.id })
      .get().id;
  // The kid already has the family copy; an older stray copy at a different rate:
  const stray = orphan("make your bed", 900);
  const own = orphan("Mow the lawn", 800);

  adoptOrphans(householdId);

  const rows = db.select().from(schema.responsibility).where(eq(schema.responsibility.childId, kid)).all();
  const strayRow = rows.find((r) => r.id === stray)!;
  expect(strayRow.templateId).toBe(family.id);
  expect(strayRow.syncedWithTemplate).toBe(false);

  const ownRow = rows.find((r) => r.id === own)!;
  const ownTemplate = db
    .select()
    .from(schema.responsibilityTemplate)
    .where(eq(schema.responsibilityTemplate.id, ownRow.templateId!))
    .get()!;
  expect(ownTemplate.name).toBe("Mow the lawn");
  expect(ownTemplate.appliesToNewChildren).toBe(false);
  expect(ownRow.syncedWithTemplate).toBe(true);
});
