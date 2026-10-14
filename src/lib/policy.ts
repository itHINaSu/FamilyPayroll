import "server-only";

import { and, desc, eq, gt, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { policyVersion } from "@/db/schema";
import { todayInHousehold } from "@/lib/dates";

/**
 * The settings catalogue (SPEC §5 and §12.9).
 *
 * Two properties matter more than the field list itself:
 *
 *  - **Family default, per-child override.** A child's effective policy is the
 *    household document with the child's overrides merged over it. Every field
 *    is optional at the child level, so an override is genuinely partial.
 *  - **Effective-dated, never mutated.** Changing a setting inserts a new
 *    version. Resolving for a past date returns what was true then, which is
 *    what lets a pay stub from last year still reproduce exactly.
 */

export const PolicySchema = z.object({
  pay: z.object({
    cadence: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
    /** 0 = Sunday. The day a pay period opens. */
    periodStartDay: z.number().int().min(0).max(6),
    payDateOffsetDays: z.number().int().min(0).max(31),
    cutoffHour: z.number().int().min(0).max(23),
    minRevisionHours: z.number().int().min(0).max(168),
  }),

  completion: z.object({
    mode: z.enum(["auto_approve_with_veto", "claim_then_approve", "parent_marks_only"]),
    whoCanClaim: z.enum(["child_kiosk", "parent_only"]),
    excusalsEnabled: z.boolean(),
  }),

  allocation: z.object({
    checkingPct: z.number().int().min(0).max(100),
    savingsPct: z.number().int().min(0).max(100),
    generosityPct: z.number().int().min(0).max(100),
    roundingBucket: z.enum(["checking", "savings", "generosity"]),
    jobPayMode: z.enum(["inherit", "checking_only"]),
  }),

  interest: z.object({
    enabled: z.boolean(),
    accounts: z.array(z.enum(["checking", "savings", "generosity"])),
    annualRateBp: z.number().int().min(0).max(100_000),
    compounding: z.enum(["simple", "compound"]),
    postingDayOfMonth: z.number().int().min(1).max(28),
  }),

  transfers: z.object({
    checkingToSavings: z.enum(["free", "requires_approval"]),
    savingsToChecking: z.enum(["free", "requires_approval"]),
    earmark: z.enum(["free", "requires_approval"]),
    unearmark: z.enum(["free", "requires_approval"]),
    generosityOut: z.enum(["free", "requires_approval"]),
  }),

  /** Defaults for newly created bills; each bill then carries its own copy. */
  bills: z.object({
    autopay: z.boolean(),
    sourceAccountOrder: z.array(z.enum(["checking", "savings"])),
    mayUseEarmarked: z.boolean(),
    shortfallPolicy: z.enum([
      "partial_pay_carry_remainder",
      "no_pay_full_carry",
      "waive",
      "block",
    ]),
    pastDueRecovery: z.enum([
      "from_gross_before_allocation",
      "from_checking_after_allocation",
      "manual",
    ]),
    pastDueMaxRecoveryPct: z.number().int().min(0).max(100),
    pastDueCapMultiple: z.number().min(0).max(12),
    nonexistentDateRule: z.enum(["next_day", "previous_day"]),
  }),

  raises: z.object({
    mode: z.enum(["manual", "automatic"]),
    scope: z.enum(["all_responsibilities", "selected"]),
    autoAmountType: z.enum(["percent", "fixed"]),
    autoPercent: z.number().min(0).max(100),
    autoFixedCents: z.number().int().min(0),
    autoFrequencyMonths: z.number().int().min(0).max(60),
  }),

  kiosk: z.object({
    dashboardMode: z.enum(["task_progress", "balances", "roster"]),
    showPendingPaycheck: z.boolean(),
  }),

  display: z.object({
    /**
     * A child can be in the family list long before they earn anything.
     * Showing them on a money dashboard with empty balances is noise, so they
     * are hidden here by default and always reachable under Children.
     */
    showNotYetEarning: z.boolean(),
    childOrder: z.enum(["oldest_first", "youngest_first", "name"]),
  }),
});

export type Policy = z.infer<typeof PolicySchema>;

/**
 * Household defaults. Every one of these is editable; the values here are the
 * starting point a new household inherits, chosen in SPEC §5.
 */
export const DEFAULT_POLICY: Policy = {
  pay: {
    cadence: "weekly",
    periodStartDay: 1, // Monday
    // Paid the morning after the week ends: the conversation about any lost
    // pay happens while the week is still fresh, not a week later.
    payDateOffsetDays: 1,
    cutoffHour: 20,
    minRevisionHours: 12,
  },
  completion: {
    mode: "auto_approve_with_veto",
    whoCanClaim: "child_kiosk",
    excusalsEnabled: true,
  },
  allocation: {
    checkingPct: 60,
    savingsPct: 20,
    generosityPct: 20,
    roundingBucket: "checking",
    jobPayMode: "inherit",
  },
  interest: {
    enabled: true,
    accounts: ["savings"],
    // Deliberately unrealistic. A real 4% APY on a $40 balance pays 13 cents a
    // month, which teaches a seven-year-old nothing they can perceive.
    annualRateBp: 1200,
    compounding: "compound",
    postingDayOfMonth: 1,
  },
  transfers: {
    checkingToSavings: "free",
    savingsToChecking: "requires_approval",
    earmark: "free",
    unearmark: "requires_approval",
    generosityOut: "requires_approval",
  },
  bills: {
    autopay: true,
    sourceAccountOrder: ["checking"],
    mayUseEarmarked: false,
    shortfallPolicy: "partial_pay_carry_remainder",
    pastDueRecovery: "from_gross_before_allocation",
    pastDueMaxRecoveryPct: 100,
    pastDueCapMultiple: 2,
    nonexistentDateRule: "next_day",
  },
  raises: {
    mode: "manual",
    scope: "all_responsibilities",
    autoAmountType: "percent",
    autoPercent: 5,
    autoFixedCents: 50,
    autoFrequencyMonths: 12,
  },
  kiosk: {
    dashboardMode: "roster",
    showPendingPaycheck: true,
  },
  display: {
    showNotYetEarning: false,
    // Oldest first: birth order is how families actually think about their
    // children, and it stays stable as they grow. Alphabetical is arbitrary.
    childOrder: "oldest_first",
  },
};

export type PartialPolicy = {
  [K in keyof Policy]?: Partial<Policy[K]>;
};

function mergePolicy(base: Policy, override: PartialPolicy): Policy {
  // Section-wise shallow merge. TypeScript cannot narrow the key-to-section
  // relationship across a mapped union, so the merge is done through a record
  // view; the shape is guaranteed by PolicySchema on the way in.
  const result: Record<string, unknown> = { ...base };
  const baseRecord = base as unknown as Record<string, object>;

  for (const [key, section] of Object.entries(override)) {
    if (section && typeof section === "object") {
      result[key] = { ...baseRecord[key], ...section };
    }
  }

  return result as unknown as Policy;
}

function versionAsOf(
  scopeType: "household" | "child",
  scopeId: string,
  onDate: string,
): PartialPolicy | null {
  const row = db
    .select()
    .from(policyVersion)
    .where(
      and(
        eq(policyVersion.scopeType, scopeType),
        eq(policyVersion.scopeId, scopeId),
        lte(policyVersion.effectiveFrom, onDate),
      ),
    )
    .orderBy(desc(policyVersion.effectiveFrom), desc(policyVersion.createdAt))
    .get();

  return (row?.payloadJson as PartialPolicy) ?? null;
}

/**
 * A child's effective policy on a date.
 *
 * Defaults ← household version as-of D ← child version as-of D. Resolving for a
 * past date returns what was true then, which is what keeps historical pay stubs
 * reproducible after every setting has been changed.
 */
export function resolvePolicy(
  householdId: string,
  childId: string | null,
  onDate?: string,
): Policy {
  const date = onDate ?? todayInHousehold();

  let policy = DEFAULT_POLICY;

  const householdVersion = versionAsOf("household", householdId, date);
  if (householdVersion) policy = mergePolicy(policy, householdVersion);

  if (childId) {
    const childVersion = versionAsOf("child", childId, date);
    if (childVersion) policy = mergePolicy(policy, childVersion);
  }

  return policy;
}

export function resolveHouseholdPolicy(householdId: string, onDate?: string): Policy {
  return resolvePolicy(householdId, null, onDate);
}

/** Raw overrides for a scope, for showing which fields diverge from the default. */
export function getOverrides(
  scopeType: "household" | "child",
  scopeId: string,
  onDate?: string,
): PartialPolicy {
  return versionAsOf(scopeType, scopeId, onDate ?? todayInHousehold()) ?? {};
}

/**
 * Record a settings change as a new version. Nothing is ever updated in place,
 * so a year of history never silently rewrites itself.
 */
export function savePolicyVersion(input: {
  scopeType: "household" | "child";
  scopeId: string;
  payload: PartialPolicy;
  createdByUserId?: string | null;
  effectiveFrom?: string;
  note?: string;
}): string {
  const row = db
    .insert(policyVersion)
    .values({
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      effectiveFrom: input.effectiveFrom ?? todayInHousehold(),
      payloadJson: input.payload,
      createdByUserId: input.createdByUserId ?? null,
      note: input.note ?? null,
    })
    .returning({ id: policyVersion.id })
    .get();

  return row.id;
}

// ---------------------------------------------------------------------------
// Changes that start on a chosen date
// ---------------------------------------------------------------------------

/**
 * Sections that decide how a pay period is paid. A change to one of these
 * asks whether it starts with this pay period or the next; the rest (who can
 * move money, display, kiosk) simply apply from today.
 */
export const PAY_PERIOD_SECTIONS = ["pay", "completion", "allocation", "interest", "bills"];

export type PolicyChange =
  | { kind: "set"; path: string; value: unknown }
  | { kind: "removeSection"; section: string };

export const changeSection = (c: PolicyChange) =>
  c.kind === "set" ? c.path.split(".")[0] : c.section;

function applyChanges(base: PartialPolicy, changes: PolicyChange[]): PartialPolicy {
  const next = structuredClone(base) as Record<string, Record<string, unknown>>;
  for (const c of changes) {
    if (c.kind === "removeSection") {
      delete next[c.section];
    } else {
      const [section, field] = c.path.split(".");
      (next[section] ??= {})[field] = c.value;
    }
  }
  return next as PartialPolicy;
}

/**
 * Record changes as a new version starting `effectiveFrom`, and carry them
 * into every version already scheduled after that date — otherwise a change
 * made today would be quietly undone when a previously scheduled one starts.
 * Only inserts: history is never rewritten.
 */
export function savePolicyChanges(input: {
  scopeType: "household" | "child";
  scopeId: string;
  changes: PolicyChange[];
  effectiveFrom: string;
  createdByUserId?: string | null;
  note?: string;
}): void {
  if (input.changes.length === 0) return;

  const later = [
    ...new Set(
      db
        .select({ effectiveFrom: policyVersion.effectiveFrom })
        .from(policyVersion)
        .where(
          and(
            eq(policyVersion.scopeType, input.scopeType),
            eq(policyVersion.scopeId, input.scopeId),
            gt(policyVersion.effectiveFrom, input.effectiveFrom),
          ),
        )
        .all()
        .map((r) => r.effectiveFrom),
    ),
  ];

  const versions = [input.effectiveFrom, ...later].map((date) => ({
    date,
    payload: applyChanges(versionAsOf(input.scopeType, input.scopeId, date) ?? {}, input.changes),
  }));

  db.transaction(() => {
    for (const v of versions) {
      savePolicyVersion({
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        payload: v.payload,
        createdByUserId: input.createdByUserId,
        effectiveFrom: v.date,
        note: input.note,
      });
    }
  });
}

/** Dates after `today` on which this scope already has a version waiting to start. */
export function scheduledVersionDates(
  scopeType: "household" | "child",
  scopeId: string,
  today: string,
): string[] {
  return [
    ...new Set(
      db
        .select({ effectiveFrom: policyVersion.effectiveFrom })
        .from(policyVersion)
        .where(
          and(
            eq(policyVersion.scopeType, scopeType),
            eq(policyVersion.scopeId, scopeId),
            gt(policyVersion.effectiveFrom, today),
          ),
        )
        .orderBy(policyVersion.effectiveFrom)
        .all()
        .map((r) => r.effectiveFrom),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Guardrails — warnings, never blocks (SPEC §2.3, §9, §12.11)
// ---------------------------------------------------------------------------

export type Guardrail = { severity: "warning"; field: string; message: string };

export function checkGuardrails(policy: Policy, childAge?: number): Guardrail[] {
  const warnings: Guardrail[] = [];
  const warn = (field: string, message: string) =>
    warnings.push({ severity: "warning", field, message });

  const allocationTotal =
    policy.allocation.checkingPct +
    policy.allocation.savingsPct +
    policy.allocation.generosityPct;

  if (allocationTotal !== 100) {
    warn(
      "allocation",
      `Allocation percentages total ${allocationTotal}%, not 100%. Payroll will not run until this is fixed.`,
    );
  }

  if (
    policy.interest.enabled &&
    policy.interest.accounts.includes("checking") &&
    policy.transfers.checkingToSavings === "free"
  ) {
    warn(
      "interest",
      "Interest on Checking while transfers are free makes the rate easy to game by moving money around.",
    );
  }

  if (
    policy.bills.pastDueMaxRecoveryPct === 100 &&
    policy.bills.pastDueCapMultiple === 0
  ) {
    warn(
      "bills",
      "Recovering 100% of gross with no past-due cap can produce repeated $0.00 pay stubs.",
    );
  }

  return warnings;
}
