import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  completion,
  excusal,
  responsibility,
  responsibilityTemplate,
  type Cadence,
  type CompletionStatus,
  type PayMode,
} from "@/db/schema";
import { listChildren } from "@/lib/children";
import { dayOfWeek, daysBetween, eachDate, todayInHousehold, type IsoDate } from "@/lib/dates";
import { earnedForResponsibility, scaleWeeklyValue } from "@/lib/money";

/**
 * Responsibilities: the paid tier (SPEC §4.4).
 *
 * A responsibility states a **weekly** value and a cadence. How many chances
 * that produces in a period, and what a partial week is worth, is computed here.
 */

export type ResponsibilityRow = typeof responsibility.$inferSelect;

/**
 * The dates in a period on which this responsibility can be completed.
 *
 * `up_to_n` is the odd one: its chances are a count rather than a set of dates,
 * because "vacuum up to three times" does not care which days.
 */
export function occurrenceDates(
  r: ResponsibilityRow,
  start: IsoDate,
  end: IsoDate,
): IsoDate[] {
  const days = eachDate(start, end);

  switch (r.cadence) {
    case "daily":
      return days;
    case "daily_selected": {
      const selected = new Set(r.daysOfWeek ?? []);
      return days.filter((d) => selected.has(dayOfWeek(d)));
    }
    case "weekly":
      return days; // once, on whichever day of the week it gets done
    case "up_to_n":
      return days; // any day is eligible; the cap limits the count
  }
}

export function chancesInPeriod(
  r: ResponsibilityRow,
  start: IsoDate,
  end: IsoDate,
): number {
  if (r.cadence === "up_to_n") {
    const weeks = Math.max(1, Math.round((eachDate(start, end).length / 7) * 10) / 10);
    return Math.max(1, Math.round((r.maxOccurrences ?? 1) * weeks));
  }
  if (r.cadence === "weekly") {
    return Math.max(1, Math.round(eachDate(start, end).length / 7));
  }
  return occurrenceDates(r, start, end).length;
}

/** Dates covered by an excusal, for this responsibility, within the period. */
export function excusedDates(
  childId: string,
  responsibilityId: string,
  start: IsoDate,
  end: IsoDate,
): Set<IsoDate> {
  const rows = db
    .select()
    .from(excusal)
    .where(and(eq(excusal.childId, childId), lte(excusal.startDate, end), gte(excusal.endDate, start)))
    .all();

  const covered = new Set<IsoDate>();
  for (const row of rows) {
    if (row.scope === "selected" && !(row.responsibilityIds ?? []).includes(responsibilityId)) {
      continue;
    }
    const from = row.startDate > start ? row.startDate : start;
    const to = row.endDate < end ? row.endDate : end;
    for (const d of eachDate(from, to)) covered.add(d);
  }
  return covered;
}

/** A period's dates split into its weeks; leftover days join the last week. */
export function weekBlocks(dates: IsoDate[], start: IsoDate, weeks: number): IsoDate[][] {
  const blocks: IsoDate[][] = Array.from({ length: Math.max(1, weeks) }, () => []);
  for (const d of dates) {
    blocks[Math.min(Math.floor(daysBetween(start, d) / 7), blocks.length - 1)].push(d);
  }
  return blocks;
}

export type PeriodResult = {
  responsibility: ResponsibilityRow;
  chances: number;
  excused: number;
  /** Chances credited: done (optional), not missed (expected), or excused. */
  completed: number;
  /** Explicit misses marked against an expected responsibility. */
  missed: number;
  potentialCents: number;
  earnedCents: number;
  /** Optional only: what checking off the rest would still add. */
  toEarnCents: number;
  /** Expected only: what misses have docked. */
  lostCents: number;
};

/** "up_to_n" has nothing to miss, so it is always optional. */
export function effectivePayMode(r: Pick<ResponsibilityRow, "payMode" | "cadence">) {
  return r.cadence === "up_to_n" ? "optional" : r.payMode;
}

/**
 * What a responsibility is worth over a period, and what was actually earned.
 *
 * Potential is always the full value: an excused day (away, sick, the chore
 * didn't exist that day) is credited as done, so it never costs pay.
 *
 * Expected responsibilities start fully earned and only an explicit "missed"
 * mark docks them; optional ones earn per check-off. All-or-nothing turns
 * any miss within a week into losing that week's whole value.
 */
export function evaluatePeriod(
  r: ResponsibilityRow,
  childId: string,
  start: IsoDate,
  end: IsoDate,
  completionMode: "auto_approve_with_veto" | "claim_then_approve" | "parent_marks_only",
): PeriodResult {
  const periodDays = eachDate(start, end).length;
  const scaledValue = scaleWeeklyValue(r.weeklyValueCents, periodDays);
  const mode = effectivePayMode(r);

  const rawChances = chancesInPeriod(r, start, end);
  const potentialCents = rawChances === 0 ? 0 : scaledValue;

  const dated = r.cadence === "daily" || r.cadence === "daily_selected";
  const dates = occurrenceDates(r, start, end);
  const excusedSet =
    r.cadence === "up_to_n" ? new Set<IsoDate>() : excusedDates(childId, r.id, start, end);
  const excusedCount =
    r.cadence === "up_to_n"
      ? 0
      : r.cadence === "weekly"
        ? weekBlocks(dates, start, rawChances).filter((w) => w.every((d) => excusedSet.has(d))).length
        : dates.filter((d) => excusedSet.has(d)).length;

  const rows = db
    .select()
    .from(completion)
    .where(
      and(
        eq(completion.responsibilityId, r.id),
        gte(completion.occurrenceDate, start),
        lte(completion.occurrenceDate, end),
      ),
    )
    .all();

  const countsAsDone = (status: CompletionStatus) =>
    completionMode === "auto_approve_with_veto"
      ? status === "claimed" || status === "approved"
      : status === "approved";

  const doneRows = rows.filter((c) => countsAsDone(c.status));
  const missedRows = rows.filter(
    (c) => c.status === "missed" && !excusedSet.has(c.occurrenceDate),
  );

  // Per-date credit for daily cadences; counts for weekly and up-to-N.
  const doneDates = new Set(doneRows.map((c) => c.occurrenceDate));
  const missedDates = new Set(missedRows.map((c) => c.occurrenceDate));
  const credited = (d: IsoDate) =>
    excusedSet.has(d) || (mode === "expected" ? !missedDates.has(d) : doneDates.has(d));

  let completed: number;
  let missed: number;
  if (r.cadence === "weekly") {
    // One chance per week, on any day of it. A week whose every day is
    // excused had no chance at all, so it's credited.
    let credit = 0;
    missed = 0;
    for (const week of weekBlocks(dates, start, rawChances)) {
      const excusedWeek = week.every((d) => excusedSet.has(d));
      const missedWeek = week.some((d) => missedDates.has(d));
      const doneWeek = week.some((d) => doneDates.has(d));
      if (mode === "expected") {
        if (missedWeek && !excusedWeek) missed++;
        else credit++;
      } else if (doneWeek || excusedWeek) {
        credit++;
      }
    }
    completed = credit;
  } else if (dated) {
    completed = dates.filter(credited).length;
    missed = mode === "expected" ? dates.filter((d) => missedDates.has(d)).length : 0;
  } else {
    // up_to_n: always earn-it, never excused.
    missed = 0;
    completed = Math.min(doneRows.length, rawChances);
  }

  let earnedCents: number;
  // Weekly already has one chance per week, so all-or-nothing is the same
  // as paying each week's share.
  if (!r.allOrNothing || r.cadence === "weekly") {
    earnedCents = earnedForResponsibility(potentialCents, completed, rawChances);
  } else if (dated && dates.length > 0) {
    // Judged week by week, so one bad week of a biweekly period costs only
    // that week's share.
    const blocks = new Map<number, IsoDate[]>();
    for (const d of dates) {
      const block = Math.floor(daysBetween(start, d) / 7);
      blocks.set(block, [...(blocks.get(block) ?? []), d]);
    }
    let lost = 0;
    let failed = 0;
    for (const blockDates of blocks.values()) {
      if (!blockDates.every(credited)) {
        failed++;
        lost += Math.round((potentialCents * blockDates.length) / dates.length);
      }
    }
    earnedCents = failed === blocks.size ? 0 : Math.max(0, potentialCents - lost);
  } else {
    earnedCents = completed >= rawChances ? potentialCents : 0;
  }

  return {
    responsibility: r,
    chances: rawChances,
    excused: excusedCount,
    completed,
    missed,
    potentialCents,
    earnedCents,
    toEarnCents: mode === "optional" ? potentialCents - earnedCents : 0,
    lostCents: mode === "expected" ? potentialCents - earnedCents : 0,
  };
}

export function listResponsibilities(childId: string, activeOnly = true) {
  const where = activeOnly
    ? and(eq(responsibility.childId, childId), eq(responsibility.active, true))
    : eq(responsibility.childId, childId);

  return db
    .select()
    .from(responsibility)
    .where(where)
    .orderBy(responsibility.sortOrder, responsibility.name)
    .all();
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Every day",
  daily_selected: "Certain days",
  weekly: "Once a week, any day",
  up_to_n: "Up to N times",
};

export function describeCadence(r: {
  cadence: Cadence;
  daysOfWeek: number[] | null;
  maxOccurrences: number | null;
}): string {
  switch (r.cadence) {
    case "daily":
      return "Every day";
    case "daily_selected": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return (r.daysOfWeek ?? []).map((d) => names[d]).join(", ") || "No days chosen";
    }
    case "weekly":
      return "Once a week, any day";
    case "up_to_n":
      return `Up to ${r.maxOccurrences ?? 1}× a week`;
  }
}

// ---------------------------------------------------------------------------
// Family-level templates
//
// Created once, applied to every child. Each child's own `responsibility`
// row is what payroll and completions actually read — a template never
// appears in a pay stub or an invariant check, only the per-child rows it
// produced. "syncedWithTemplate" is what lets a template-wide edit reach
// every child who hasn't customized their own copy without ever touching
// the ones who have.
// ---------------------------------------------------------------------------

export type ResponsibilityTemplateRow = typeof responsibilityTemplate.$inferSelect;

export type TemplateInput = {
  name: string;
  weeklyValueCents: number;
  cadence: Cadence;
  daysOfWeek?: number[] | null;
  maxOccurrences?: number | null;
  payMode?: PayMode;
  allOrNothing?: boolean;
};

function normalizeCadenceFields(input: TemplateInput) {
  return {
    daysOfWeek: input.cadence === "daily_selected" ? (input.daysOfWeek ?? null) : null,
    maxOccurrences: input.cadence === "up_to_n" ? (input.maxOccurrences ?? 1) : null,
    payMode: (input.cadence === "up_to_n" ? "optional" : (input.payMode ?? "expected")) as PayMode,
    allOrNothing: input.allOrNothing ?? false,
  };
}

export function listResponsibilityTemplates(householdId: string, activeOnly = true) {
  const where = activeOnly
    ? and(eq(responsibilityTemplate.householdId, householdId), eq(responsibilityTemplate.active, true))
    : eq(responsibilityTemplate.householdId, householdId);

  return db
    .select()
    .from(responsibilityTemplate)
    .where(where)
    .orderBy(responsibilityTemplate.sortOrder, responsibilityTemplate.name)
    .all();
}

function insertTemplateRow(
  householdId: string,
  input: TemplateInput,
  appliesToNewChildren: boolean,
): ResponsibilityTemplateRow {
  const cadenceFields = normalizeCadenceFields(input);

  return db
    .insert(responsibilityTemplate)
    .values({
      householdId,
      appliesToNewChildren,
      name: input.name,
      weeklyValueCents: input.weeklyValueCents,
      cadence: input.cadence,
      ...cadenceFields,
    })
    .returning()
    .get();
}

function instantiateTemplateFor(
  template: ResponsibilityTemplateRow,
  childIds: string[],
): void {
  const today = todayInHousehold();

  childIds.forEach((childId, index) => {
    db.insert(responsibility)
      .values({
        childId,
        templateId: template.id,
        syncedWithTemplate: true,
        name: template.name,
        weeklyValueCents: template.weeklyValueCents,
        cadence: template.cadence,
        daysOfWeek: template.daysOfWeek,
        maxOccurrences: template.maxOccurrences,
        payMode: template.payMode,
        allOrNothing: template.allOrNothing,
        effectiveFrom: today,
        sortOrder: index,
      })
      .run();
  });
}

/** Creates a family template and instantiates it for every current child. */
export function createResponsibilityTemplate(
  householdId: string,
  input: TemplateInput,
): ResponsibilityTemplateRow {
  const template = insertTemplateRow(householdId, input, true);
  instantiateTemplateFor(
    template,
    listChildren(householdId).map((c) => c.id),
  );
  return template;
}

/**
 * Creates a family template from within one child's own page. It still
 * joins the global list — so it can be turned on for a sibling later — but
 * by default only the child it was created for is subscribed to it.
 */
export function createResponsibilityTemplateForChild(
  householdId: string,
  childId: string,
  input: TemplateInput,
  applyToAllChildren: boolean,
): ResponsibilityTemplateRow {
  const template = insertTemplateRow(householdId, input, applyToAllChildren);
  const childIds = applyToAllChildren
    ? listChildren(householdId).map((c) => c.id)
    : [childId];
  instantiateTemplateFor(template, childIds);
  return template;
}

export function getResponsibilityTemplate(
  householdId: string,
  templateId: string,
): ResponsibilityTemplateRow | undefined {
  return db
    .select()
    .from(responsibilityTemplate)
    .where(
      and(
        eq(responsibilityTemplate.id, templateId),
        eq(responsibilityTemplate.householdId, householdId),
      ),
    )
    .get();
}

export function setTemplateAppliesToNewChildren(
  householdId: string,
  templateId: string,
  value: boolean,
): void {
  db.update(responsibilityTemplate)
    .set({ appliesToNewChildren: value })
    .where(
      and(
        eq(responsibilityTemplate.id, templateId),
        eq(responsibilityTemplate.householdId, householdId),
      ),
    )
    .run();
}

/** Edits the template and propagates the new values to every synced child row. */
export function updateResponsibilityTemplate(templateId: string, input: TemplateInput): void {
  const cadenceFields = normalizeCadenceFields(input);

  db.update(responsibilityTemplate)
    .set({ name: input.name, weeklyValueCents: input.weeklyValueCents, cadence: input.cadence, ...cadenceFields })
    .where(eq(responsibilityTemplate.id, templateId))
    .run();

  const synced = db
    .select({ id: responsibility.id })
    .from(responsibility)
    .where(
      and(
        eq(responsibility.templateId, templateId),
        eq(responsibility.syncedWithTemplate, true),
        eq(responsibility.active, true),
      ),
    )
    .all();

  for (const r of synced) {
    db.update(responsibility)
      .set({
        name: input.name,
        weeklyValueCents: input.weeklyValueCents,
        cadence: input.cadence,
        ...cadenceFields,
      })
      .where(eq(responsibility.id, r.id))
      .run();
  }
}

/** Retires a template entirely, archiving every child row it produced. */
export function archiveResponsibilityTemplate(templateId: string): void {
  const now = Date.now();

  db.update(responsibilityTemplate)
    .set({ active: false, archivedAt: now })
    .where(eq(responsibilityTemplate.id, templateId))
    .run();

  const rows = db
    .select({ id: responsibility.id })
    .from(responsibility)
    .where(and(eq(responsibility.templateId, templateId), eq(responsibility.active, true)))
    .all();

  for (const r of rows) {
    db.update(responsibility).set({ active: false, archivedAt: now }).where(eq(responsibility.id, r.id)).run();
  }
}

/** Turns a template off for one child — "disable per child." */
export function disableTemplateForChild(childId: string, templateId: string): void {
  db.update(responsibility)
    .set({ active: false, archivedAt: Date.now() })
    .where(
      and(
        eq(responsibility.childId, childId),
        eq(responsibility.templateId, templateId),
        eq(responsibility.active, true),
      ),
    )
    .run();
}

/** Turns a template back on for one child, mirroring its current values. */
export function enableTemplateForChild(childId: string, templateId: string): void {
  const template = db
    .select()
    .from(responsibilityTemplate)
    .where(eq(responsibilityTemplate.id, templateId))
    .get();
  if (!template) return;

  const existing = db
    .select()
    .from(responsibility)
    .where(and(eq(responsibility.childId, childId), eq(responsibility.templateId, templateId)))
    .all();

  if (existing.some((r) => r.active)) return; // already on

  // Re-activate and resync the previous row rather than creating a duplicate,
  // so old completions under that id stay attached to the same responsibility.
  const disabledRow = existing.find((r) => !r.active);
  if (disabledRow) {
    db.update(responsibility)
      .set({
        active: true,
        archivedAt: null,
        syncedWithTemplate: true,
        name: template.name,
        weeklyValueCents: template.weeklyValueCents,
        cadence: template.cadence,
        daysOfWeek: template.daysOfWeek,
        maxOccurrences: template.maxOccurrences,
        payMode: template.payMode,
        allOrNothing: template.allOrNothing,
      })
      .where(eq(responsibility.id, disabledRow.id))
      .run();
    return;
  }

  db.insert(responsibility)
    .values({
      childId,
      templateId,
      syncedWithTemplate: true,
      name: template.name,
      weeklyValueCents: template.weeklyValueCents,
      cadence: template.cadence,
      daysOfWeek: template.daysOfWeek,
      maxOccurrences: template.maxOccurrences,
      payMode: template.payMode,
      allOrNothing: template.allOrNothing,
      effectiveFrom: todayInHousehold(),
    })
    .run();
}

/** Subscribes a newly added child to every family-wide responsibility. */
export function instantiateTemplatesForChild(householdId: string, childId: string): void {
  const templates = listResponsibilityTemplates(householdId).filter(
    (t) => t.appliesToNewChildren,
  );
  const today = todayInHousehold();

  templates.forEach((t, index) => {
    db.insert(responsibility)
      .values({
        childId,
        templateId: t.id,
        syncedWithTemplate: true,
        name: t.name,
        weeklyValueCents: t.weeklyValueCents,
        cadence: t.cadence,
        daysOfWeek: t.daysOfWeek,
        maxOccurrences: t.maxOccurrences,
        payMode: t.payMode,
        allOrNothing: t.allOrNothing,
        effectiveFrom: today,
        sortOrder: index,
      })
      .run();
  });
}

/**
 * Which children currently have this template enabled, disabled, or
 * customized — the per-child breakdown the family hub shows for each
 * template.
 */
export function templateChildStatus(householdId: string, templateId: string) {
  const children = listChildren(householdId);
  const rows = db
    .select()
    .from(responsibility)
    .where(eq(responsibility.templateId, templateId))
    .all();

  return children.map((c) => {
    const row = rows.find((r) => r.childId === c.id && r.active);
    return {
      childId: c.id,
      childName: c.displayName,
      enabled: !!row,
      customized: row ? !row.syncedWithTemplate : false,
      weeklyValueCents: row?.weeklyValueCents ?? null,
    };
  });
}

/** Reads the shared "how it pays" fields from a responsibility form. */
export function parsePayFields(formData: FormData): { payMode: PayMode; allOrNothing: boolean } {
  return {
    payMode: formData.get("payMode") === "optional" ? "optional" : "expected",
    allOrNothing: formData.get("allOrNothing") === "on",
  };
}

/**
 * A parent's tap on one day. Expected: toggles a miss. Optional: toggles a
 * check-off (approved outright if only parents mark things, otherwise a
 * claim that stands unless vetoed).
 */
export function toggleDay(input: {
  childId: string;
  responsibilityId: string;
  date: IsoDate;
  parentId: string;
  completionMode: "auto_approve_with_veto" | "claim_then_approve" | "parent_marks_only";
}): void {
  const r = db
    .select()
    .from(responsibility)
    .where(and(eq(responsibility.id, input.responsibilityId), eq(responsibility.childId, input.childId)))
    .get();
  if (!r) return;

  const existing = db
    .select()
    .from(completion)
    .where(and(eq(completion.responsibilityId, r.id), eq(completion.occurrenceDate, input.date)))
    .get();

  if (existing) {
    db.delete(completion).where(eq(completion.id, existing.id)).run();
    return;
  }

  const expected = effectivePayMode(r) === "expected";
  const approved = !expected && input.completionMode === "parent_marks_only";
  db.insert(completion)
    .values({
      responsibilityId: r.id,
      childId: input.childId,
      occurrenceDate: input.date,
      status: expected ? "missed" : approved ? "approved" : "claimed",
      claimedByUserId: input.parentId,
      decidedByUserId: expected || approved ? input.parentId : null,
    })
    .run();
}
