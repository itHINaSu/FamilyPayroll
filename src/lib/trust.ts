import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  child,
  focusNote,
  houseRule,
  privilege,
  trustArea,
  trustAreaChild,
  trustAreaOverride,
  trustMark,
  trustState,
} from "@/db/schema";
import { listChildren } from "@/lib/children";
import { resolvePolicy } from "@/lib/policy";

/**
 * Track B — trust and privileges (SPEC §12).
 *
 * Invariant I10: nothing in this file writes a ledger entry, alters a balance,
 * or changes earned pay. Trust governs what a child is *trusted with*, never
 * what they are paid.
 *
 * The mechanism is a leaky bucket per area: marks add load, time drains it.
 * Two properties are load-bearing rather than incidental:
 *
 *  - **Time drains it, not the parent.** A parent who does nothing produces
 *    recovery, not punishment. Without this, forgetting to clear a status is a
 *    silent sentence that runs for a week over something neither party recalls.
 *  - **Credits floor at zero.** Positive marks speed up recovery but cannot be
 *    banked. A child can make something right; a child cannot pre-buy an
 *    afternoon they have not had yet.
 */

export const TRUST_LEVELS = [
  { level: 3, name: "Trusted", tone: "green" },
  { level: 2, name: "Working on it", tone: "amber" },
  { level: 1, name: "Not ready today", tone: "orange" },
  { level: 0, name: "Taking a break", tone: "red" },
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const DEFAULT_THRESHOLDS = { level2: 1, level1: 3, level0: 5 };

export type Thresholds = typeof DEFAULT_THRESHOLDS;

export function levelForLoad(load: number, thresholds: Thresholds): TrustLevel {
  if (load >= thresholds.level0) return TRUST_LEVELS[3];
  if (load >= thresholds.level1) return TRUST_LEVELS[2];
  if (load >= thresholds.level2) return TRUST_LEVELS[1];
  return TRUST_LEVELS[0];
}

type EffectiveConfig = {
  drainAmount: number;
  drainIntervalHours: number;
  capLoad: number;
  thresholds: Thresholds;
};

function effectiveConfig(childId: string, areaId: string): EffectiveConfig {
  const c = db.select().from(child).where(eq(child.id, childId)).get();
  const area = db.select().from(trustArea).where(eq(trustArea.id, areaId)).get();
  const override = db
    .select()
    .from(trustAreaOverride)
    .where(
      and(
        eq(trustAreaOverride.childId, childId),
        eq(trustAreaOverride.trustAreaId, areaId),
      ),
    )
    .get();

  const policy = c ? resolvePolicy(c.householdId, childId) : null;

  return {
    drainAmount:
      override?.drainAmount ?? area?.drainAmount ?? policy?.trust.drainAmount ?? 2,
    drainIntervalHours:
      override?.drainIntervalHours ??
      area?.drainIntervalHours ??
      policy?.trust.drainIntervalHours ??
      12,
    capLoad: override?.capLoad ?? area?.capLoad ?? policy?.trust.capLoad ?? 6,
    thresholds: (area?.thresholdsJson as Thresholds) ?? DEFAULT_THRESHOLDS,
  };
}

/**
 * Read the bucket, applying elapsed drain first.
 *
 * Drain is applied lazily on read and persisted, so there is no scheduled job to
 * miss. A container that was off all weekend still returns the right answer the
 * moment it comes back.
 */
export function currentLoad(childId: string, areaId: string): number {
  const config = effectiveConfig(childId, areaId);

  let state = db
    .select()
    .from(trustState)
    .where(and(eq(trustState.childId, childId), eq(trustState.trustAreaId, areaId)))
    .get();

  if (!state) {
    db.insert(trustState)
      .values({ childId, trustAreaId: areaId, load: 0, lastDrainedAt: Date.now() })
      .run();
    return 0;
  }

  const intervalMs = config.drainIntervalHours * 3_600_000;
  const periods = Math.floor((Date.now() - state.lastDrainedAt) / intervalMs);

  if (periods > 0 && state.load > 0) {
    const drained = Math.max(0, state.load - periods * config.drainAmount);
    db.update(trustState)
      .set({
        load: drained,
        lastDrainedAt: state.lastDrainedAt + periods * intervalMs,
        updatedAt: Date.now(),
      })
      .where(eq(trustState.id, state.id))
      .run();
    return drained;
  }

  if (periods > 0) {
    // Keep the clock moving even at zero, so a long quiet spell does not bank
    // drain credit that instantly erases the next mark.
    db.update(trustState)
      .set({ lastDrainedAt: state.lastDrainedAt + periods * intervalMs })
      .where(eq(trustState.id, state.id))
      .run();
  }

  return state.load;
}

export type AreaStatus = {
  areaId: string;
  areaName: string;
  load: number;
  level: TrustLevel;
  pinned: boolean;
  /** When the bucket reaches zero. The child-facing unit is time, not points. */
  clearsAt: number | null;
  capLoad: number;
};

export function trustLevelFor(childId: string, areaId: string): AreaStatus {
  const config = effectiveConfig(childId, areaId);
  const area = db.select().from(trustArea).where(eq(trustArea.id, areaId)).get();
  const load = currentLoad(childId, areaId);

  const state = db
    .select()
    .from(trustState)
    .where(and(eq(trustState.childId, childId), eq(trustState.trustAreaId, areaId)))
    .get();

  const pinActive =
    state?.pinnedLevel !== null &&
    state?.pinnedLevel !== undefined &&
    (!state.pinExpiresAt || state.pinExpiresAt > Date.now());

  const level = pinActive
    ? (TRUST_LEVELS.find((l) => l.level === state!.pinnedLevel) ?? TRUST_LEVELS[0])
    : levelForLoad(load, config.thresholds);

  const periodsToClear = Math.ceil(load / config.drainAmount);

  return {
    areaId,
    areaName: area?.name ?? "Trust",
    load,
    level,
    pinned: !!pinActive,
    clearsAt:
      load > 0
        ? (state?.lastDrainedAt ?? Date.now()) +
          periodsToClear * config.drainIntervalHours * 3_600_000
        : null,
    capLoad: config.capLoad,
  };
}

export function trustSummary(childId: string): AreaStatus[] {
  const c = db.select().from(child).where(eq(child.id, childId)).get();
  if (!c) return [];

  const areas = db
    .select({ area: trustArea })
    .from(trustArea)
    .innerJoin(
      trustAreaChild,
      and(eq(trustAreaChild.trustAreaId, trustArea.id), eq(trustAreaChild.childId, childId)),
    )
    .where(and(eq(trustArea.householdId, c.householdId), eq(trustArea.active, true)))
    .orderBy(trustArea.sortOrder)
    .all();

  return areas.map(({ area: a }) => trustLevelFor(childId, a.id));
}

/**
 * Record a mark. Positive weight is an infraction, negative is a credit.
 *
 * The load floors at zero and ceilings at the cap: credits cannot be banked
 * against future misbehaviour, and one catastrophic afternoon cannot create a
 * hole a young child cannot see the end of.
 */
export function recordMark(input: {
  childId: string;
  trustAreaId: string;
  houseRuleId?: string | null;
  weight: number;
  note?: string | null;
  createdByUserId: string;
}): string {
  const config = effectiveConfig(input.childId, input.trustAreaId);
  const load = currentLoad(input.childId, input.trustAreaId);

  const markId = db
    .insert(trustMark)
    .values({
      childId: input.childId,
      trustAreaId: input.trustAreaId,
      houseRuleId: input.houseRuleId ?? null,
      weight: input.weight,
      note: input.note ?? null,
      occurredAt: Date.now(),
      createdByUserId: input.createdByUserId,
    })
    .returning({ id: trustMark.id })
    .get().id;

  const next = Math.max(0, Math.min(config.capLoad, load + input.weight));

  db.update(trustState)
    .set({ load: next, updatedAt: Date.now() })
    .where(
      and(
        eq(trustState.childId, input.childId),
        eq(trustState.trustAreaId, input.trustAreaId),
      ),
    )
    .run();

  return markId;
}

/**
 * Retract a mark.
 *
 * Deliberately different from the ledger: this is a parenting tool, not a
 * financial record. A parent who marked something in anger must be able to undo
 * it cleanly, and making them post a compensating entry to erase an unfair mark
 * would be both bad interface and bad parenting.
 */
export function retractMark(markId: string): void {
  const mark = db.select().from(trustMark).where(eq(trustMark.id, markId)).get();
  if (!mark || mark.retractedAt) return;

  const config = effectiveConfig(mark.childId, mark.trustAreaId);
  const load = currentLoad(mark.childId, mark.trustAreaId);

  db.update(trustMark)
    .set({ retractedAt: Date.now() })
    .where(eq(trustMark.id, markId))
    .run();

  const next = Math.max(0, Math.min(config.capLoad, load - mark.weight));

  db.update(trustState)
    .set({ load: next, updatedAt: Date.now() })
    .where(
      and(
        eq(trustState.childId, mark.childId),
        eq(trustState.trustAreaId, mark.trustAreaId),
      ),
    )
    .run();
}

/** Pin a level manually. Pins expire so an override cannot become permanent. */
export function pinLevel(
  childId: string,
  areaId: string,
  level: number | null,
  expiresInHours?: number,
): void {
  currentLoad(childId, areaId); // ensures a state row exists

  db.update(trustState)
    .set({
      pinnedLevel: level,
      pinExpiresAt:
        level === null
          ? null
          : Date.now() + (expiresInHours ?? 24) * 3_600_000,
      updatedAt: Date.now(),
    })
    .where(and(eq(trustState.childId, childId), eq(trustState.trustAreaId, areaId)))
    .run();
}

export function listMarks(childId: string, limit = 30) {
  return db
    .select({ mark: trustMark, area: trustArea, rule: houseRule })
    .from(trustMark)
    .innerJoin(trustArea, eq(trustMark.trustAreaId, trustArea.id))
    .leftJoin(houseRule, eq(trustMark.houseRuleId, houseRule.id))
    .where(eq(trustMark.childId, childId))
    .orderBy(desc(trustMark.occurredAt))
    .limit(limit)
    .all();
}

export function listHouseRules(householdId: string) {
  return db
    .select({ rule: houseRule, area: trustArea })
    .from(houseRule)
    .innerJoin(trustArea, eq(houseRule.trustAreaId, trustArea.id))
    .where(and(eq(houseRule.householdId, householdId), eq(houseRule.active, true)))
    .orderBy(trustArea.sortOrder, houseRule.sortOrder)
    .all();
}

/**
 * What a child is and is not ready for right now.
 *
 * The application communicates readiness; it never enforces it. Nothing here
 * disables a television — putting a child in an argument with a screen instead
 * of a conversation with a parent loses the entire point.
 */
export function privilegesFor(childId: string): {
  ready: { name: string; areaName: string }[];
  notYet: { name: string; areaName: string; needs: string }[];
} {
  const c = db.select().from(child).where(eq(child.id, childId)).get();
  if (!c) return { ready: [], notYet: [] };

  const rows = db
    .select({ priv: privilege, area: trustArea })
    .from(privilege)
    .innerJoin(trustArea, eq(privilege.trustAreaId, trustArea.id))
    .innerJoin(
      trustAreaChild,
      and(eq(trustAreaChild.trustAreaId, trustArea.id), eq(trustAreaChild.childId, childId)),
    )
    .where(and(eq(privilege.householdId, c.householdId), eq(privilege.active, true)))
    .orderBy(trustArea.sortOrder, privilege.sortOrder)
    .all();

  const ready: { name: string; areaName: string }[] = [];
  const notYet: { name: string; areaName: string; needs: string }[] = [];

  for (const { priv, area } of rows) {
    const status = trustLevelFor(childId, area.id);
    if (status.level.level >= priv.minLevel) {
      ready.push({ name: priv.name, areaName: area.name });
    } else {
      notYet.push({
        name: priv.name,
        areaName: area.name,
        needs: TRUST_LEVELS.find((l) => l.level === priv.minLevel)?.name ?? "",
      });
    }
  }

  return { ready, notYet };
}

// ---------------------------------------------------------------------------
// Area membership — which children an area applies to.
// ---------------------------------------------------------------------------

export function areaMembers(areaId: string): Set<string> {
  const rows = db
    .select({ childId: trustAreaChild.childId })
    .from(trustAreaChild)
    .where(eq(trustAreaChild.trustAreaId, areaId))
    .all();
  return new Set(rows.map((r) => r.childId));
}

export function joinArea(areaId: string, childId: string): void {
  db.insert(trustAreaChild)
    .values({ trustAreaId: areaId, childId })
    .onConflictDoNothing()
    .run();
}

export function leaveArea(areaId: string, childId: string): void {
  db.delete(trustAreaChild)
    .where(and(eq(trustAreaChild.trustAreaId, areaId), eq(trustAreaChild.childId, childId)))
    .run();
}

/** A newly created area applies to every current child by default. */
export function joinAreaForAllChildren(householdId: string, areaId: string): void {
  for (const c of listChildren(householdId)) joinArea(areaId, c.id);
}

/** A newly created child is a member of every active area by default. */
export function joinAllAreasForChild(householdId: string, childId: string): void {
  const areas = db
    .select({ id: trustArea.id })
    .from(trustArea)
    .where(and(eq(trustArea.householdId, householdId), eq(trustArea.active, true)))
    .all();
  for (const a of areas) joinArea(a.id, childId);
}

export function currentFocusNote(childId: string) {
  return (
    db
      .select()
      .from(focusNote)
      .where(eq(focusNote.childId, childId))
      .orderBy(desc(focusNote.createdAt))
      .get() ?? null
  );
}

export function setFocusNote(
  childId: string,
  text: string,
  actorUserId: string,
  expiresInHours = 24,
): void {
  db.delete(focusNote).where(eq(focusNote.childId, childId)).run();
  if (!text.trim()) return;

  db.insert(focusNote)
    .values({
      childId,
      text: text.trim(),
      createdByUserId: actorUserId,
      expiresAt: Date.now() + expiresInHours * 3_600_000,
    })
    .run();
}

/** Areas shipped with a new household. Entirely editable — a starting point. */
export const DEFAULT_AREAS = [
  { name: "Home", icon: "🏠" },
  { name: "Friendships", icon: "🤝" },
  { name: "Screens", icon: "📱" },
  { name: "Out & About", icon: "🚲" },
];

/**
 * Starter house rules. Wording is the point: every one of these is observable.
 * "Have a good attitude" is not measurable and is what the guardrail warns on.
 */
export const DEFAULT_HOUSE_RULES: Record<string, { text: string; weight: number }[]> = {
  Home: [
    { text: "Follow directions the first time", weight: 1 },
    { text: "Speak respectfully, even when upset", weight: 2 },
    { text: "Clean up before starting something else", weight: 1 },
    { text: "Tell the truth about what happened", weight: 2 },
  ],
  Friendships: [
    { text: "Disagree without hitting", weight: 2 },
    { text: "Take turns and share", weight: 1 },
    { text: "Include everyone who wants to play", weight: 1 },
  ],
  Screens: [
    { text: "Turn it off the first time you are asked", weight: 1 },
    { text: "Be honest about how long you have had it", weight: 2 },
  ],
  "Out & About": [
    { text: "Stay where a grown-up can see you", weight: 2 },
    { text: "Come back when you said you would", weight: 1 },
  ],
};
