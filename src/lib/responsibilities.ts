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

/**
 * The same split counted back from the period's end, so after a schedule
 * change the real weeks line up with the new schedule and any extra days
 * sit at the front: 4–6 extra days are a short week of their own, 1–3 join
 * the first week and make it a long one.
 */
export function weekBlocksFromEnd(dates: IsoDate[], end: IsoDate, weeks: number): IsoDate[][] {
  const count = Math.max(1, weeks);
  const blocks: IsoDate[][] = Array.from({ length: count }, () => []);
  for (const d of dates) {
    blocks[count - 1 - Math.min(Math.floor(daysBetween(d, end) / 7), count - 1)].push(d);
  }
  return blocks;
}

/**
 * How an expectation is valued over a period:
 *  - "weeks" (weekly and every-two-weeks pay): each week of the period pays
 *    a "once a week" or "up to N times" expectation in full — even a short
 *    transition week — and a day-based one is paid per scheduled day, so a
 *    short week pays less and a long week more;
 *  - "days" (twice a month, monthly): the weekly value scaled to the
 *    period's length.
 * For an ordinary week or fortnight the two agree exactly.
 */
export type Valuation = "weeks" | "days";

export function valuationFor(cadence: string): Valuation {
  return cadence === "weekly" || cadence === "biweekly" ? "weeks" : "days";
}

/** Scheduled days in a normal week, for a day-based expectation. */
function occurrencesPerWeek(r: ResponsibilityRow): number {
  if (r.cadence === "daily") return 7;
  if (r.cadence === "daily_selected") return new Set(r.daysOfWeek ?? []).size;
  return 0;
}

export type CompletionMode = "auto_approve_with_veto" | "claim_then_approve" | "parent_marks_only";

/** Weekday letters, Sunday first; Thursday is R so it can't be confused with Tuesday. */
export const DAY_LETTERS = ["S", "M", "T", "W", "R", "F", "S"];

/**
 * One box on the week view. Keep-it boxes are "met" until a parent unchecks
 * them ("missed"); earn-it boxes are "open" until checked ("done"). Day
 * boxes belong to a date; numbered boxes ("once a week", "N times a week")
 * belong to the week and are interchangeable.
 */
export type Box = {
  key: string;
  label: string;
  /** Day boxes: the occurrence date. Numbered boxes: the week's first day. */
  date: IsoDate;
  numbered: boolean;
  state: "met" | "missed" | "done" | "open" | "excused";
  /** Not yet happened — nothing to mark. */
  future: boolean;
  /** The miss behind a "missed" box, for its note. */
  missId: string | null;
  note: string | null;
};

export type WeekBreakdown = {
  start: IsoDate;
  end: IsoDate;
  chances: number;
  credited: number;
  missed: number;
  boxes: Box[];
};

export type PeriodResult = {
  responsibility: ResponsibilityRow;
  chances: number;
  excused: number;
  /** Chances credited: done (earn it), not missed (keep it), or excused. */
  completed: number;
  /** Misses marked against a keep-it responsibility. */
  missed: number;
  potentialCents: number;
  earnedCents: number;
  /** Earn it only: what checking off the rest would still add. */
  toEarnCents: number;
  /** Keep it only: what misses have docked. */
  lostCents: number;
  weeks: WeekBreakdown[];
  /** Every miss in the period with its optional note, oldest first. */
  misses: { id: string; date: IsoDate; note: string | null }[];
};

export function effectivePayMode(r: Pick<ResponsibilityRow, "payMode">) {
  return r.payMode;
}

/** How many numbered boxes a week gets, or null for day boxes. */
function slotsPerWeek(r: ResponsibilityRow): number | null {
  if (r.cadence === "weekly") return 1;
  if (r.cadence === "up_to_n") return Math.max(1, r.maxOccurrences ?? 1);
  return null;
}

/**
 * What a responsibility is worth over a period, what was earned, and the
 * week-by-week boxes behind it.
 *
 * Potential is always the full value: an excused day (away, sick, the
 * expectation didn't exist that day) is credited, so it never costs pay.
 * Keep-it starts fully earned and each marked miss docks its share; earn-it
 * earns per check-off. All-or-nothing turns any miss within a week into
 * losing that week's whole value.
 */
export function evaluatePeriod(
  r: ResponsibilityRow,
  childId: string,
  start: IsoDate,
  end: IsoDate,
  completionMode: CompletionMode,
  today: IsoDate = todayInHousehold(),
  opts: { valuation?: Valuation } = {},
): PeriodResult {
  const valuation = opts.valuation ?? "days";
  const days = eachDate(start, end);
  const expected = r.payMode === "expected";
  const slots = slotsPerWeek(r);
  const occurs = new Set(occurrenceDates(r, start, end));
  const excusedSet = excusedDates(childId, r.id, start, end);

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
    .all()
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.claimedAt - b.claimedAt);

  const isDone = (status: CompletionStatus) =>
    completionMode === "auto_approve_with_veto"
      ? status === "claimed" || status === "approved"
      : status === "approved";
  const missRows = rows.filter((c) => c.status === "missed" && !excusedSet.has(c.occurrenceDate));

  const numWeeks = Math.max(1, Math.round(days.length / 7));
  const blocks =
    valuation === "weeks"
      ? weekBlocksFromEnd(days, end, numWeeks)
      : weekBlocks(days, start, numWeeks);

  const scaledValue =
    valuation === "days"
      ? scaleWeeklyValue(r.weeklyValueCents, days.length)
      : slots !== null
        ? r.weeklyValueCents * blocks.length
        : occurrencesPerWeek(r) === 0
          ? 0
          : Math.round((r.weeklyValueCents * occurs.size) / occurrencesPerWeek(r));

  const weeks: WeekBreakdown[] = blocks.map((week) => {
    const weekStart = week[0];
    const weekEnd = week[week.length - 1];
    const inWeek = (d: IsoDate) => d >= weekStart && d <= weekEnd;

    if (slots === null) {
      const boxes: Box[] = week
        .filter((d) => occurs.has(d))
        .map((d) => {
          const miss = missRows.find((c) => c.occurrenceDate === d);
          const done = rows.some((c) => c.occurrenceDate === d && isDone(c.status));
          return {
            key: d,
            label: DAY_LETTERS[dayOfWeek(d)],
            date: d,
            numbered: false,
            state: excusedSet.has(d)
              ? "excused"
              : expected
                ? miss
                  ? "missed"
                  : "met"
                : done
                  ? "done"
                  : "open",
            future: d > today,
            missId: expected ? (miss?.id ?? null) : null,
            note: expected ? (miss?.note ?? null) : null,
          };
        });
      return {
        start: weekStart,
        end: weekEnd,
        chances: boxes.length,
        credited: boxes.filter((b) => b.state !== "missed" && b.state !== "open").length,
        missed: boxes.filter((b) => b.state === "missed").length,
        boxes,
      };
    }

    // Numbered boxes: the week has `slots` interchangeable chances.
    const excusedWeek = week.every((d) => excusedSet.has(d));
    const weekMisses = missRows.filter((c) => inWeek(c.occurrenceDate)).slice(0, slots);
    const weekDone = Math.min(
      slots,
      rows.filter((c) => inWeek(c.occurrenceDate) && isDone(c.status)).length,
    );
    const marked = expected ? weekMisses.length : weekDone;

    const boxes: Box[] = Array.from({ length: slots }, (_, i) => {
      // Keep-it: misses fill from the right; earn-it: check-offs from the left.
      const missIndex = i - (slots - marked);
      const miss = expected && missIndex >= 0 ? weekMisses[missIndex] : undefined;
      return {
        key: `${weekStart}#${i}`,
        label: String(i + 1),
        date: weekStart,
        numbered: true,
        state: excusedWeek
          ? "excused"
          : expected
            ? miss
              ? "missed"
              : "met"
            : i < marked
              ? "done"
              : "open",
        future: weekStart > today,
        missId: miss?.id ?? null,
        note: miss?.note ?? null,
      };
    });
    return {
      start: weekStart,
      end: weekEnd,
      chances: slots,
      credited: excusedWeek ? slots : expected ? slots - marked : marked,
      missed: excusedWeek || !expected ? 0 : marked,
      boxes,
    };
  });

  const chances = weeks.reduce((n, w) => n + w.chances, 0);
  const completed = weeks.reduce((n, w) => n + w.credited, 0);
  const missed = weeks.reduce((n, w) => n + w.missed, 0);
  const potentialCents = chances === 0 ? 0 : scaledValue;

  let earnedCents: number;
  if (!r.allOrNothing) {
    earnedCents = earnedForResponsibility(potentialCents, completed, chances);
  } else {
    const failed = weeks.filter((w) => w.chances > 0 && w.credited < w.chances);
    const lost = failed.reduce(
      (n, w) => n + Math.round((potentialCents * w.chances) / chances),
      0,
    );
    const live = weeks.filter((w) => w.chances > 0);
    earnedCents = failed.length === live.length ? 0 : Math.max(0, potentialCents - lost);
  }

  return {
    responsibility: r,
    chances,
    excused: weeks.reduce(
      (n, w) => n + w.boxes.filter((b) => b.state === "excused").length,
      0,
    ),
    completed,
    missed,
    potentialCents,
    earnedCents,
    toEarnCents: expected ? 0 : potentialCents - earnedCents,
    lostCents: expected ? potentialCents - earnedCents : 0,
    weeks,
    misses: expected
      ? weeks.flatMap((w) =>
          w.boxes
            .filter((b) => b.state === "missed")
            .map((b) => {
              const row = missRows.find((c) => c.id === b.missId);
              return { id: b.missId!, date: row?.occurrenceDate ?? b.date, note: b.note };
            }),
        )
      : [],
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
  /** Optional abbreviation for the Dashboard; blank falls back to the name. */
  shortName?: string | null;
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
    payMode: input.payMode ?? "expected",
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
      shortName: input.shortName || null,
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

/**
 * Creates a family expectation and gives it to the chosen children (all of
 * them by default). Picking everyone also gives it to children added later.
 */
export function createResponsibilityTemplate(
  householdId: string,
  input: TemplateInput,
  childIds?: string[],
): ResponsibilityTemplateRow {
  const all = listChildren(householdId).map((c) => c.id);
  const chosen = childIds ? all.filter((id) => childIds.includes(id)) : all;
  const template = insertTemplateRow(householdId, input, chosen.length === all.length);
  instantiateTemplateFor(template, chosen);
  return template;
}

/** Puts a customized child copy back on its family template's values. */
export function resyncResponsibility(responsibilityId: string): void {
  const row = db.select().from(responsibility).where(eq(responsibility.id, responsibilityId)).get();
  if (!row?.templateId) return;
  const t = db
    .select()
    .from(responsibilityTemplate)
    .where(eq(responsibilityTemplate.id, row.templateId))
    .get();
  if (!t) return;
  db.update(responsibility)
    .set({
      syncedWithTemplate: true,
      name: t.name,
      weeklyValueCents: t.weeklyValueCents,
      cadence: t.cadence,
      daysOfWeek: t.daysOfWeek,
      maxOccurrences: t.maxOccurrences,
      payMode: t.payMode,
      allOrNothing: t.allOrNothing,
    })
    .where(eq(responsibility.id, responsibilityId))
    .run();
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
    .set({
      name: input.name,
      shortName: input.shortName || null,
      weeklyValueCents: input.weeklyValueCents,
      cadence: input.cadence,
      ...cadenceFields,
    })
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
      row: row
        ? {
            id: row.id,
            weeklyValueCents: row.weeklyValueCents,
            cadence: row.cadence,
            daysOfWeek: row.daysOfWeek,
            maxOccurrences: row.maxOccurrences,
            payMode: row.payMode,
            allOrNothing: row.allOrNothing,
          }
        : null,
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
 * A parent's tap on one box. Keep-it: unchecking a met box records a miss,
 * re-checking a missed box removes it. Earn-it: checking an open box
 * records a check-off (approved outright if only parents mark things,
 * otherwise a claim that stands unless vetoed), unchecking removes it.
 *
 * Day boxes act on their date. Numbered boxes act on the week: a new mark
 * lands on today if today is in that week (else the week's first day), and
 * removing takes the most recent mark in the week.
 *
 * Returns the id of a miss it just created, so the parent can add a note.
 */
export function toggleBox(input: {
  childId: string;
  responsibilityId: string;
  /** Day box: its date. Numbered box: the week's first day. */
  date: IsoDate;
  /** Numbered boxes only: the week's last day. */
  weekEnd?: IsoDate;
  /** Whether the tapped box currently shows checked. */
  checked: boolean;
  parentId: string;
  completionMode: CompletionMode;
}): { missId: string | null } {
  const r = db
    .select()
    .from(responsibility)
    .where(
      and(eq(responsibility.id, input.responsibilityId), eq(responsibility.childId, input.childId)),
    )
    .get();
  if (!r) return { missId: null };

  const expected = r.payMode === "expected";
  const today = todayInHousehold();
  const from = input.date;
  const to = input.weekEnd ?? input.date;

  const existing = db
    .select()
    .from(completion)
    .where(
      and(
        eq(completion.responsibilityId, r.id),
        gte(completion.occurrenceDate, from),
        lte(completion.occurrenceDate, to),
      ),
    )
    .all()
    .filter((c) => (expected ? c.status === "missed" : c.status !== "missed"))
    .sort((a, b) => b.claimedAt - a.claimedAt);

  // Keep-it: checked → add a miss. Earn-it: checked → remove a check-off.
  const removing = expected ? !input.checked : input.checked;
  if (removing) {
    if (existing[0]) db.delete(completion).where(eq(completion.id, existing[0].id)).run();
    return { missId: null };
  }

  const date = input.weekEnd ? (today >= from && today <= to ? today : from) : input.date;
  const sameDay = db
    .select({ id: completion.id })
    .from(completion)
    .where(and(eq(completion.responsibilityId, r.id), eq(completion.occurrenceDate, date)))
    .all().length;
  if (!input.weekEnd && sameDay > 0) return { missId: null };

  const approved = !expected && input.completionMode === "parent_marks_only";
  const row = db
    .insert(completion)
    .values({
      responsibilityId: r.id,
      childId: input.childId,
      occurrenceDate: date,
      occurrenceIndex: sameDay,
      status: expected ? "missed" : approved ? "approved" : "claimed",
      claimedByUserId: input.parentId,
      decidedByUserId: expected || approved ? input.parentId : null,
    })
    .returning({ id: completion.id })
    .get();

  return { missId: expected ? row.id : null };
}
