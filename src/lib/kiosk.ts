import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { child, device } from "@/db/schema";
import { upcomingBills } from "@/lib/bills";
import { ageFromBirthdate } from "@/lib/children";
import { payPeriodFor, todayInHousehold } from "@/lib/dates";
import { listGoals } from "@/lib/goals";
import { getBalances } from "@/lib/ledger";
import { computeDraft } from "@/lib/payroll";
import { resolvePolicy } from "@/lib/policy";
import { evaluatePeriod, listResponsibilities } from "@/lib/responsibilities";
import { currentFocusNote, privilegesFor, trustSummary } from "@/lib/trust";

/**
 * The kiosk view model.
 *
 * This is the only place a child-facing payload is assembled, which is
 * deliberate: invariants I4 and I11 are enforced here, at the serialisation
 * boundary, rather than trusted to every template downstream.
 *
 *  - I4: the `held` account and every bill disposition are absent. There is no
 *    field for them to leak through.
 *  - I11: trust never appears on the shared roster, only inside a single child's
 *    own view, and the numeric load appears only when a parent opted in.
 */

export function createDeviceToken(householdId: string, name: string): string {
  const token = randomBytes(24).toString("base64url");

  db.insert(device)
    .values({
      householdId,
      name,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    })
    .run();

  return token;
}

export function deviceForToken(token: string) {
  const row = db
    .select()
    .from(device)
    .where(
      and(
        eq(device.tokenHash, createHash("sha256").update(token).digest("hex")),
        eq(device.active, true),
      ),
    )
    .get();

  if (row) {
    db.update(device).set({ lastSeenAt: Date.now() }).where(eq(device.id, row.id)).run();
  }

  return row ?? null;
}

export type KioskChild = {
  id: string;
  name: string;
  age: number;
  photoBlobId: string | null;
  checking: number;
  savings: number;
  generosity: number;
  total: number;
  /** Earned this period but not yet paid — the real-job lesson. */
  pendingCents: number;
  potentialCents: number;
  payDate: string;
  responsibilities: {
    id: string;
    name: string;
    completed: number;
    chances: number;
    remainingCents: number;
  }[];
  goals: { name: string; photoBlobId: string | null; progressPct: number }[];
  nextBill: { name: string; dueDate: string; shortfallCents: number } | null;
};

export function kioskRoster(householdId: string): KioskChild[] {
  const children = db
    .select()
    .from(child)
    .where(and(eq(child.householdId, householdId), eq(child.status, "active")))
    .orderBy(child.sortOrder, child.displayName)
    .all();

  const today = todayInHousehold();

  return children.map((c) => {
    const policy = resolvePolicy(householdId, c.id, today);
    const period = payPeriodFor(today, {
      cadence: policy.pay.cadence,
      periodStartDay: policy.pay.periodStartDay,
      payDateOffsetDays: policy.pay.payDateOffsetDays,
    });

    // getBalances returns `held`, so it is destructured away rather than spread.
    const balances = getBalances(c.id);
    const draft = computeDraft(householdId, c.id, period.startDate, period.endDate);

    const responsibilities = listResponsibilities(c.id).map((r) => {
      const result = evaluatePeriod(
        r,
        c.id,
        period.startDate,
        period.endDate,
        policy.completion.mode,
      );
      return {
        id: r.id,
        name: r.name,
        completed: result.completed,
        chances: result.chances,
        // Framed as money still available, never as a list of failures.
        remainingCents: Math.max(0, result.potentialCents - result.earnedCents),
      };
    });

    const bills = upcomingBills(c.id, 10);
    const next = bills[0];

    return {
      id: c.id,
      name: c.displayName,
      age: ageFromBirthdate(c.birthdate),
      photoBlobId: c.photoBlobId,
      checking: balances.checking,
      savings: balances.savings,
      generosity: balances.generosity,
      total: balances.visibleTotal,
      pendingCents: policy.kiosk.showPendingPaycheck ? draft.earnedCents : 0,
      potentialCents: draft.potentialCents,
      payDate: period.payDate,
      responsibilities,
      goals: listGoals(c.id).map((g) => ({
        name: g.name,
        photoBlobId: g.photoBlobId,
        progressPct: g.progressPct,
      })),
      nextBill: next
        ? {
            name: next.billName,
            dueDate: next.dueDate,
            shortfallCents: next.shortfallCents,
          }
        : null,
    };
  });
}

export type KioskChildDetail = KioskChild & {
  trust: {
    areaName: string;
    levelName: string;
    tone: string;
    /** Always shown: the child-facing unit is time, not points. */
    recovery: string;
    /** Null unless a parent opted in (SPEC §12.2.1). */
    load: number | null;
  }[];
  focusNote: string | null;
  readyFor: string[];
  notReadyFor: string[];
};

/**
 * A single child's own view. Trust appears here and nowhere else — a red state
 * beside a sibling's green one is a scoreboard, not a conversation (I11).
 */
export function kioskChildDetail(
  householdId: string,
  childId: string,
): KioskChildDetail | null {
  const base = kioskRoster(householdId).find((c) => c.id === childId);
  if (!base) return null;

  const policy = resolvePolicy(householdId, childId);
  const showLoad = policy.trust.childVisibility !== "level_only";
  const privileges = privilegesFor(childId);

  return {
    ...base,
    trust: policy.trust.enabled
      ? trustSummary(childId).map((area) => ({
          areaName: area.areaName,
          levelName: area.level.name,
          tone: area.level.tone,
          recovery: describeRecovery(area.clearsAt),
          load: showLoad ? area.load : null,
        }))
      : [],
    focusNote: currentFocusNote(childId)?.text ?? null,
    readyFor: privileges.ready.map((p) => p.name),
    notReadyFor: privileges.notYet.map((p) => p.name),
  };
}

function describeRecovery(clearsAt: number | null): string {
  if (!clearsAt) return "All clear";

  const hours = Math.max(0, (clearsAt - Date.now()) / 3_600_000);
  if (hours < 1) return "Clears within the hour";
  if (hours < 24) return `Clears in about ${Math.round(hours)} hours`;

  const when = new Date(clearsAt);
  const days = Math.ceil(hours / 24);
  const weekday = when.toLocaleDateString("en-US", { weekday: "long" });

  return days <= 6
    ? `Back to Trusted on ${weekday}`
    : `Back to Trusted in about ${days} days`;
}
