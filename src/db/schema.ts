/**
 * Family Payroll schema.
 *
 * Conventions that hold everywhere in this file:
 *
 *  - Money is a signed INTEGER count of cents (invariant I1). Never a float.
 *    Interest accrues in micro-cents (10^-6 cents) for the same reason.
 *  - Instants are INTEGER unix epoch milliseconds.
 *  - Calendar dates are TEXT 'YYYY-MM-DD'. A due date or an occurrence date is a
 *    date on a wall calendar, not a moment in time; storing them as instants
 *    invites timezone drift across DST boundaries.
 *  - Enumerations are TEXT with an explicit union type, checked at the type level.
 */

import { sql, relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "number" }).notNull().default(now);

// ---------------------------------------------------------------------------
// Identity and structure
// ---------------------------------------------------------------------------

export const household = sqliteTable("household", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  weekStartDay: integer("week_start_day").notNull().default(1), // 0=Sun .. 6=Sat
  /** Canonical HTTPS origin. Required before Web Push can work (spec 8.2). */
  appUrl: text("app_url"),
  /** VAPID `sub` claim: a mailto: or https: value. Apple validates this. */
  vapidContact: text("vapid_contact"),
  guardrailsEnabled: integer("guardrails_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  /**
   * The master switch for the money cycle (scheduler.ts: payroll, bills,
   * interest). Paused iff set — the date it was paused, so resuming can
   * excuse exactly that stretch. See lib/payroll-pause.ts.
   */
  payrollPausedOn: text("payroll_paused_on"),
  /**
   * Last resume date. Pay periods that ended before it were entirely paused
   * and are never drafted, so resuming never back-pays or back-bills.
   */
  payrollResumedOn: text("payroll_resumed_on"),
  setupCompletedAt: integer("setup_completed_at"),
  createdAt: createdAt(),
});

/**
 * Infrastructure secrets: session signing key, VAPID keypair.
 * Held apart from `household` so exports can exclude the whole table.
 */
export const appSecret = sqliteTable("app_secret", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: createdAt(),
});

export type UserRole = "parent" | "child";

export const user = sqliteTable(
  "user",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    /**
     * The login identifier. Column name is a holdover from an earlier design —
     * it is validated and shown to the user as a plain username (see
     * lib/auth/username.ts), never actually used as an email address.
     */
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    /** Set only for role='child'; links a login to its child record. */
    childId: text("child_id"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /**
     * TOTP (RFC 6238), authenticator-app second factor. `totpSecret` is written
     * the moment enrollment starts, before it is confirmed — it is inert until
     * `totpEnabledAt` is set, which only happens once a real code from it has
     * been verified, so an abandoned enrollment never locks anyone out.
     */
    totpSecret: text("totp_secret"),
    totpEnabledAt: integer("totp_enabled_at"),
    /** Hashed single-use recovery codes, shown once at enrollment. */
    totpRecoveryCodesJson: text("totp_recovery_codes_json", { mode: "json" }).$type<
      { hash: string; usedAt: number | null }[]
    >(),
    createdAt: createdAt(),
    lastLoginAt: integer("last_login_at"),
  },
  (t) => [uniqueIndex("user_email_unique").on(t.email)],
);

/**
 * The gap between "password verified" and "session issued" when a login has
 * a second factor. Deliberately its own short-lived, single-use token rather
 * than a half-authenticated session — nothing about a pending challenge can
 * be used to skip the code check, and it self-expires in minutes.
 */
export const pendingMfaChallenge = sqliteTable("pending_mfa_challenge", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: createdAt(),
});

/**
 * A one-time link for creating a login — a second parent, or a child old
 * enough for their own — since the app has no email sending capability to
 * mail one instead. Handed over directly (text message, AirDrop, whatever).
 * Only the hash is stored, matching the kiosk device token; the plaintext
 * token is shown exactly once, in the URL, right after creation.
 *
 * `childId` is set only for role='child' invites, and is what the redeemed
 * login gets linked to — the same column `user.childId` already uses.
 */
export const invite = sqliteTable(
  "invite",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    role: text("role").$type<UserRole>().notNull(),
    childId: text("child_id"),
    tokenHash: text("token_hash").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    usedByUserId: text("used_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invite_token_unique").on(t.tokenHash)],
);

export const session = sqliteTable(
  "session",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("session_token_unique").on(t.tokenHash),
    index("session_user_idx").on(t.userId),
  ],
);

/** Invariant I7: children are archived, never deleted. */
export type ChildStatus = "pre_participant" | "active" | "graduated" | "archived";

export const child = sqliteTable(
  "child",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    /** Age is always derived from this. Never stored. */
    birthdate: text("birthdate").notNull(),
    photoBlobId: text("photo_blob_id"),
    status: text("status").$type<ChildStatus>().notNull().default("active"),
    joinedAt: integer("joined_at").notNull().default(now),
    graduatedAt: integer("graduated_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("child_household_idx").on(t.householdId, t.status)],
);

export type DashboardMode = "task_progress" | "balances" | "roster";

export const device = sqliteTable(
  "device",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    dashboardMode: text("dashboard_mode")
      .$type<DashboardMode>()
      .notNull()
      .default("roster"),
    lastSeenAt: integer("last_seen_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("device_token_unique").on(t.tokenHash)],
);

// ---------------------------------------------------------------------------
// Policy (versioned, effective-dated) — spec 4.2
// ---------------------------------------------------------------------------

export type PolicyScope = "household" | "child";

/**
 * Changing a setting INSERTs a new row; nothing is ever mutated. A child's
 * effective policy on date D is deep_merge(household as-of D, child as-of D).
 * Pay stubs and bill instances additionally embed their resolved snapshot, so
 * history survives even a schema change.
 */
export const policyVersion = sqliteTable(
  "policy_version",
  {
    id: id(),
    scopeType: text("scope_type").$type<PolicyScope>().notNull(),
    scopeId: text("scope_id").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).notNull(),
    createdByUserId: text("created_by_user_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("policy_scope_idx").on(t.scopeType, t.scopeId, t.effectiveFrom),
  ],
);

// ---------------------------------------------------------------------------
// Accounts, goals, ledger — spec 4.3
// ---------------------------------------------------------------------------

export type AccountType = "checking" | "savings" | "generosity" | "held";

export const account = sqliteTable(
  "account",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    type: text("type").$type<AccountType>().notNull(),
    /**
     * Invariant I4. The `held` account — where bills with a held_for_child
     * disposition accumulate — is always false and must never be serialized
     * into a child-facing or kiosk response.
     */
    visibleToChild: integer("visible_to_child", { mode: "boolean" })
      .notNull()
      .default(true),
    /** Cached balance; invariant I6 asserts this equals the ledger sum nightly. */
    balanceCents: integer("balance_cents").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("account_child_type_unique").on(t.childId, t.type)],
);

export type GoalStatus = "active" | "achieved" | "cancelled";

export const goal = sqliteTable(
  "goal",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetCents: integer("target_cents").notNull(),
    photoBlobId: text("photo_blob_id"),
    status: text("status").$type<GoalStatus>().notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    achievedAt: integer("achieved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("goal_child_idx").on(t.childId, t.status)],
);

export type LedgerEntryType =
  | "opening_balance"
  | "payroll_deposit"
  | "bonus_deposit"
  | "cash_deposit"
  | "cash_withdrawal"
  | "purchase"
  | "bill_charge"
  | "bill_payment"
  | "past_due_recovery"
  | "transfer_in"
  | "transfer_out"
  | "earmark_in"
  | "earmark_out"
  | "interest"
  | "donation"
  | "adjustment"
  | "reversal";

export type LedgerSource = "payroll" | "manual" | "system" | "kiosk";

/**
 * The append-only core (invariant I2). Enforced by SQLite triggers in migration
 * 0001, not by convention. Corrections are new rows with `reversesEntryId` set;
 * the original always stays.
 *
 * Savings sub-buckets live here rather than as separate accounts:
 *   total savings   = SUM WHERE account = savings
 *   general savings = SUM WHERE account = savings AND goal_id IS NULL
 *   a goal          = SUM WHERE goal_id = X
 */
export const ledgerEntry = sqliteTable(
  "ledger_entry",
  {
    id: id(),
    householdId: text("household_id").notNull(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id),
    goalId: text("goal_id"),
    amountCents: integer("amount_cents").notNull(),
    type: text("type").$type<LedgerEntryType>().notNull(),
    occurredAt: integer("occurred_at").notNull(),
    postedAt: integer("posted_at").notNull().default(now),
    description: text("description").notNull(),
    memo: text("memo"),
    actorUserId: text("actor_user_id"),
    source: text("source").$type<LedgerSource>().notNull(),
    reversesEntryId: text("reverses_entry_id"),
    paystubId: text("paystub_id"),
    billInstanceId: text("bill_instance_id"),
    jobClaimId: text("job_claim_id"),
    /** Two entries of a transfer share this. Double-entry-lite. */
    transferGroupId: text("transfer_group_id"),
  },
  (t) => [
    index("ledger_child_idx").on(t.childId, t.occurredAt),
    index("ledger_account_idx").on(t.accountId, t.occurredAt),
    index("ledger_goal_idx").on(t.goalId),
    index("ledger_type_idx").on(t.type),
  ],
);

// ---------------------------------------------------------------------------
// Responsibilities — spec 4.4 (the paid tier; see also House Rules in spec 12)
// ---------------------------------------------------------------------------

export type Cadence = "daily" | "daily_selected" | "weekly" | "up_to_n";

/**
 * expected: the week's pay is theirs from the start; a parent marks a miss
 * and that docks it. optional: starts empty; each check-off earns its share.
 * Up-to-N is always optional — "up to three times" has nothing to miss.
 */
export type PayMode = "expected" | "optional";

/**
 * The family-level definition — created once, applied to every child by
 * default. A child's own `responsibility` row is what payroll and
 * completions actually read; this is the thing that keeps their values in
 * sync until a parent deliberately customizes one child's copy.
 */
export const responsibilityTemplate = sqliteTable(
  "responsibility_template",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    weeklyValueCents: integer("weekly_value_cents").notNull(),
    cadence: text("cadence").$type<Cadence>().notNull(),
    daysOfWeek: text("days_of_week", { mode: "json" }).$type<number[]>(),
    maxOccurrences: integer("max_occurrences"),
    /** See PayMode. */
    payMode: text("pay_mode").$type<PayMode>().notNull().default("expected"),
    /** One miss in a week forfeits that whole week's value for this responsibility. */
    allOrNothing: integer("all_or_nothing", { mode: "boolean" }).notNull().default(false),
    /**
     * Whether a child added later gets this automatically. True for
     * family-wide responsibilities; false for one created on a single
     * child's page without "Apply to all children".
     */
    appliesToNewChildren: integer("applies_to_new_children", { mode: "boolean" })
      .notNull()
      .default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    archivedAt: integer("archived_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("responsibility_template_household_idx").on(t.householdId, t.active)],
);

export const responsibility = sqliteTable(
  "responsibility",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    /**
     * Set when this row was instantiated from a family template. Null for a
     * one-off added directly on a child's own page (an age preset, or a
     * chore that only applies to one kid).
     */
    templateId: text("template_id").references(() => responsibilityTemplate.id, {
      onDelete: "set null",
    }),
    /**
     * True while this row still mirrors its template. A direct edit here
     * flips it false, so a later template-wide edit does not clobber a
     * deliberate per-child customization (a different rate for an older
     * sibling doing the same chore, say).
     */
    syncedWithTemplate: integer("synced_with_template", { mode: "boolean" })
      .notNull()
      .default(true),
    name: text("name").notNull(),
    icon: text("icon"),
    /** The weekly ceiling. Earned pay can never exceed it (invariant I9). */
    weeklyValueCents: integer("weekly_value_cents").notNull(),
    cadence: text("cadence").$type<Cadence>().notNull(),
    /** JSON array of weekday numbers, for cadence='daily_selected'. */
    daysOfWeek: text("days_of_week", { mode: "json" }).$type<number[]>(),
    /** Chance ceiling for cadence='up_to_n'. */
    maxOccurrences: integer("max_occurrences"),
    /** See PayMode. */
    payMode: text("pay_mode").$type<PayMode>().notNull().default("expected"),
    /** One miss in a week forfeits that whole week's value for this responsibility. */
    allOrNothing: integer("all_or_nothing", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    effectiveFrom: text("effective_from").notNull(),
    archivedAt: integer("archived_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("responsibility_child_idx").on(t.childId, t.active),
    index("responsibility_template_idx").on(t.templateId),
  ],
);

/** "missed" is a parent's mark against an expected responsibility. */
export type CompletionStatus = "claimed" | "approved" | "rejected" | "excused" | "missed";

export const completion = sqliteTable(
  "completion",
  {
    id: id(),
    responsibilityId: text("responsibility_id")
      .notNull()
      .references(() => responsibility.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    occurrenceDate: text("occurrence_date").notNull(),
    /** Disambiguates multiple same-day completions under cadence='up_to_n'. */
    occurrenceIndex: integer("occurrence_index").notNull().default(0),
    status: text("status").$type<CompletionStatus>().notNull(),
    claimedByUserId: text("claimed_by_user_id"),
    decidedByUserId: text("decided_by_user_id"),
    claimedAt: integer("claimed_at").notNull().default(now),
    decidedAt: integer("decided_at"),
    payPeriodId: text("pay_period_id"),
  },
  (t) => [
    uniqueIndex("completion_occurrence_unique").on(
      t.responsibilityId,
      t.occurrenceDate,
      t.occurrenceIndex,
    ),
    index("completion_child_date_idx").on(t.childId, t.occurrenceDate),
  ],
);

export type ExcusalScope = "all" | "selected";

/**
 * Vacation, illness, away for the weekend. Excused occurrences are removed from
 * the chances denominator, so POTENTIAL pay drops and earned pay is untouched
 * (invariant I8). A sick week must never look like a failed week.
 */
export const excusal = sqliteTable(
  "excusal",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    reason: text("reason"),
    scope: text("scope").$type<ExcusalScope>().notNull().default("all"),
    responsibilityIds: text("responsibility_ids", { mode: "json" }).$type<string[]>(),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("excusal_child_idx").on(t.childId, t.startDate, t.endDate)],
);

// ---------------------------------------------------------------------------
// Job board — spec 4.5
// ---------------------------------------------------------------------------

export type RepeatRule = "once" | "weekly" | "monthly" | "every_n_days";
export type LimitScope = "per_child" | "global";
export type JobAllocationMode = "inherit" | "checking_only";

export const job = sqliteTable(
  "job",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    photoBlobId: text("photo_blob_id"),
    valueCents: integer("value_cents").notNull(),
    /** Null means every active child is eligible. */
    eligibleChildIds: text("eligible_child_ids", { mode: "json" }).$type<
      string[]
    >(),
    repeatRule: text("repeat_rule").$type<RepeatRule>().notNull(),
    repeatN: integer("repeat_n"),
    /** Answers "can both kids vacuum this week, or is it first-come?" */
    limitScope: text("limit_scope").$type<LimitScope>().notNull().default("per_child"),
    limitCount: integer("limit_count").notNull().default(1),
    /** Stops a child squatting on a claimed job indefinitely. */
    claimExpiryHours: integer("claim_expiry_hours").notNull().default(48),
    allocationMode: text("allocation_mode")
      .$type<JobAllocationMode>()
      .notNull()
      .default("inherit"),
    requiresApproval: integer("requires_approval", { mode: "boolean" })
      .notNull()
      .default(true),
    /**
     * Optional trust gate. Invariant I10 bounds this precisely: trust may stop a
     * child CLAIMING work they are not ready for, and may never reduce pay for
     * work already done. Opt-in per job, off by default.
     */
    trustAreaId: text("trust_area_id"),
    minTrustLevel: integer("min_trust_level"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("job_household_idx").on(t.householdId, t.active)],
);

export type JobClaimStatus =
  | "claimed"
  | "submitted"
  | "approved"
  | "rejected"
  | "expired";

export const jobClaim = sqliteTable(
  "job_claim",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    status: text("status").$type<JobClaimStatus>().notNull().default("claimed"),
    /** Frozen at claim time so a later job edit cannot rewrite owed pay. */
    valueCentsSnapshot: integer("value_cents_snapshot").notNull(),
    claimedAt: integer("claimed_at").notNull().default(now),
    expiresAt: integer("expires_at").notNull(),
    submittedAt: integer("submitted_at"),
    decidedByUserId: text("decided_by_user_id"),
    decidedAt: integer("decided_at"),
    payPeriodId: text("pay_period_id"),
  },
  (t) => [
    index("job_claim_child_idx").on(t.childId, t.status),
    index("job_claim_job_idx").on(t.jobId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Bills — spec 4.6. Rent is not special; it is a bill whose disposition is
// held_for_child.
// ---------------------------------------------------------------------------

export type BillCadence = "weekly" | "monthly";
export type NonexistentDateRule = "next_day" | "previous_day";
export type BillDisposition = "held_for_child" | "disappears" | "family_fund";
export type ShortfallPolicy =
  | "partial_pay_carry_remainder"
  | "no_pay_full_carry"
  | "waive"
  | "block";
export type PastDueRecovery =
  | "from_gross_before_allocation"
  | "from_checking_after_allocation"
  | "manual";

/**
 * The family-level definition — created once, applied to every child by
 * default, same as a responsibility template. Only the fields that make
 * sense to share are here; past-due handling and the nonexistent-date rule
 * stay policy-derived per child at instantiation time, since those already
 * have a household/child-override resolution path of their own.
 */
export const billTemplate = sqliteTable(
  "bill_template",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    cadence: text("cadence").$type<BillCadence>().notNull(),
    dueDay: integer("due_day").notNull(),
    disposition: text("disposition").$type<BillDisposition>().notNull(),
    sourceAccountOrder: text("source_account_order", { mode: "json" })
      .$type<AccountType[]>()
      .notNull(),
    mayUseEarmarked: integer("may_use_earmarked", { mode: "boolean" })
      .notNull()
      .default(false),
    autopay: integer("autopay", { mode: "boolean" }).notNull().default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    archivedAt: integer("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [index("bill_template_household_idx").on(t.householdId, t.active)],
);

export const bill = sqliteTable(
  "bill",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    templateId: text("template_id").references(() => billTemplate.id, {
      onDelete: "set null",
    }),
    /** True while this bill still mirrors its family template. */
    syncedWithTemplate: integer("synced_with_template", { mode: "boolean" })
      .notNull()
      .default(true),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    cadence: text("cadence").$type<BillCadence>().notNull(),
    /** Day of month for monthly; weekday number for weekly. */
    dueDay: integer("due_day").notNull(),
    nonexistentDateRule: text("nonexistent_date_rule")
      .$type<NonexistentDateRule>()
      .notNull()
      .default("next_day"),
    /**
     * Invariant I4: parent-only. Never rendered to a child in any view. This is
     * what makes the rent fund a secret.
     */
    disposition: text("disposition").$type<BillDisposition>().notNull(),
    sourceAccountOrder: text("source_account_order", { mode: "json" })
      .$type<AccountType[]>()
      .notNull(),
    /** Goal money is protected from bills unless a parent opts in. */
    mayUseEarmarked: integer("may_use_earmarked", { mode: "boolean" })
      .notNull()
      .default(false),
    autopay: integer("autopay", { mode: "boolean" }).notNull().default(true),
    shortfallPolicy: text("shortfall_policy")
      .$type<ShortfallPolicy>()
      .notNull()
      .default("partial_pay_carry_remainder"),
    pastDueRecovery: text("past_due_recovery")
      .$type<PastDueRecovery>()
      .notNull()
      .default("from_gross_before_allocation"),
    pastDueMaxRecoveryPct: integer("past_due_max_recovery_pct").notNull().default(100),
    pastDueCapCents: integer("past_due_cap_cents"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    effectiveFrom: text("effective_from").notNull(),
    archivedAt: integer("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("bill_child_idx").on(t.childId, t.active),
    index("bill_template_idx").on(t.templateId),
  ],
);

export type BillInstanceStatus =
  | "scheduled"
  | "due"
  | "partially_paid"
  | "paid"
  | "past_due"
  | "waived";

export const billInstance = sqliteTable(
  "bill_instance",
  {
    id: id(),
    billId: text("bill_id")
      .notNull()
      .references(() => bill.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    dueDate: text("due_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidCents: integer("paid_cents").notNull().default(0),
    status: text("status").$type<BillInstanceStatus>().notNull().default("scheduled"),
    policySnapshotJson: text("policy_snapshot_json", { mode: "json" }),
    generatedAt: integer("generated_at").notNull().default(now),
    paidAt: integer("paid_at"),
  },
  (t) => [
    uniqueIndex("bill_instance_unique").on(t.billId, t.dueDate),
    index("bill_instance_child_idx").on(t.childId, t.dueDate, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Payroll — spec 4.7
// ---------------------------------------------------------------------------

export type PayPeriodStatus = "open" | "closed" | "drafted" | "posted";

/** Per child, because the pay schedule is a per-child policy. */
export const payPeriod = sqliteTable(
  "pay_period",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    /** Deliberately distinct from endDate: this is what creates "accrued but unpaid". */
    payDate: text("pay_date").notNull(),
    status: text("status").$type<PayPeriodStatus>().notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("pay_period_unique").on(t.childId, t.startDate),
    index("pay_period_status_idx").on(t.status, t.payDate),
  ],
);

export type PaystubStatus = "draft" | "posted" | "void";

/** Invariant I5: once posted, immutable, and it carries its own policy snapshot. */
export const paystub = sqliteTable(
  "paystub",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    payPeriodId: text("pay_period_id")
      .notNull()
      .references(() => payPeriod.id, { onDelete: "cascade" }),
    status: text("status").$type<PaystubStatus>().notNull().default("draft"),
    potentialCents: integer("potential_cents").notNull(),
    earnedCents: integer("earned_cents").notNull(),
    bonusCents: integer("bonus_cents").notNull().default(0),
    grossCents: integer("gross_cents").notNull(),
    pastDueRecoveredCents: integer("past_due_recovered_cents").notNull().default(0),
    netCents: integer("net_cents").notNull(),
    /** Invariant I3: these always sum to netCents exactly. */
    allocationsJson: text("allocations_json", { mode: "json" }).notNull(),
    policySnapshotJson: text("policy_snapshot_json", { mode: "json" }).notNull(),
    computedAt: integer("computed_at").notNull().default(now),
    revisionWindowEndsAt: integer("revision_window_ends_at").notNull(),
    postedAt: integer("posted_at"),
    revisionCount: integer("revision_count").notNull().default(0),
    lastRevisedByUserId: text("last_revised_by_user_id"),
  },
  (t) => [
    uniqueIndex("paystub_period_unique").on(t.payPeriodId),
    index("paystub_child_idx").on(t.childId, t.status),
  ],
);

export type PaystubLineKind =
  | "responsibility"
  | "job"
  | "adjustment"
  | "past_due_recovery";

export const paystubLine = sqliteTable(
  "paystub_line",
  {
    id: id(),
    paystubId: text("paystub_id")
      .notNull()
      .references(() => paystub.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PaystubLineKind>().notNull(),
    refId: text("ref_id"),
    label: text("label").notNull(),
    potentialCents: integer("potential_cents").notNull().default(0),
    earnedCents: integer("earned_cents").notNull().default(0),
    detailJson: text("detail_json", { mode: "json" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("paystub_line_idx").on(t.paystubId)],
);

// ---------------------------------------------------------------------------
// Interest — spec 4.8
// ---------------------------------------------------------------------------

/**
 * One row per account per day. Daily accrual against each day's balance is what
 * real banks do, and it is also what makes interest ungameable: because
 * checking -> savings transfers are free, an end-of-period basis would let a
 * child park everything in savings the night before posting.
 *
 * $40 at 12% APR accrues $0.0132/day, so accrual MUST be sub-cent. Micro-cents
 * are integers; rounding happens once, at monthly posting.
 */
export const interestAccrual = sqliteTable(
  "interest_accrual",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    accrualDate: text("accrual_date").notNull(),
    basisBalanceCents: integer("basis_balance_cents").notNull(),
    annualRateBp: integer("annual_rate_bp").notNull(),
    accruedMicroCents: integer("accrued_micro_cents").notNull(),
    postedAt: integer("posted_at"),
  },
  (t) => [
    uniqueIndex("interest_accrual_unique").on(t.accountId, t.accrualDate),
    index("interest_unposted_idx").on(t.accountId, t.postedAt),
  ],
);

// ---------------------------------------------------------------------------
// Approvals, notifications, media, audit — spec 4.9
// ---------------------------------------------------------------------------

export type ApprovalKind =
  | "savings_withdrawal"
  | "purchase"
  | "donation"
  | "goal_break"
  | "job_submission";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export const approvalRequest = sqliteTable(
  "approval_request",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ApprovalKind>().notNull(),
    amountCents: integer("amount_cents"),
    targetJson: text("target_json", { mode: "json" }),
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),
    note: text("note"),
    requestedAt: integer("requested_at").notNull().default(now),
    decidedByUserId: text("decided_by_user_id"),
    decidedAt: integer("decided_at"),
  },
  (t) => [index("approval_child_idx").on(t.childId, t.status)],
);

export type NotificationChannelKind = "web_push" | "ntfy" | "pushover" | "email";

export const notificationChannel = sqliteTable("notification_channel", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").$type<NotificationChannelKind>().notNull(),
  configJson: text("config_json", { mode: "json" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

/**
 * One row per user per installed device. Subscriptions die silently, so the
 * server prunes on 404/410 and the client re-subscribes on every launch.
 * Removing and re-adding the iOS home screen app destroys the subscription.
 */
export const pushSubscription = sqliteTable(
  "push_subscription",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dhKey: text("p256dh_key").notNull(),
    authKey: text("auth_key").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSuccessAt: integer("last_success_at"),
    failureCount: integer("failure_count").notNull().default(0),
    expiredAt: integer("expired_at"),
  },
  (t) => [uniqueIndex("push_endpoint_unique").on(t.endpoint)],
);

export const notificationRule = sqliteTable("notification_rule", {
  id: id(),
  scopeType: text("scope_type").$type<PolicyScope>().notNull(),
  scopeId: text("scope_id").notNull(),
  eventType: text("event_type").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  leadTimeMinutes: integer("lead_time_minutes"),
  quietHoursJson: text("quiet_hours_json", { mode: "json" }),
});

export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: id(),
    eventType: text("event_type").notNull(),
    channelId: text("channel_id"),
    payloadHash: text("payload_hash").notNull(),
    result: text("result").notNull(),
    detail: text("detail"),
    sentAt: integer("sent_at").notNull().default(now),
  },
  (t) => [index("notification_dedupe_idx").on(t.payloadHash, t.sentAt)],
);

/**
 * Uploads accept any file size; the server downscales, re-encodes to WebP, and
 * stores only the derivative. Keeping it inside SQLite preserves the "backup is
 * one file" guarantee.
 */
export const blobStore = sqliteTable("blob", {
  id: id(),
  householdId: text("household_id").notNull(),
  mime: text("mime").notNull(),
  bytes: blob("bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: createdAt(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJson: text("before_json", { mode: "json" }),
    afterJson: text("after_json", { mode: "json" }),
    at: integer("at").notNull().default(now),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId, t.at)],
);

// ---------------------------------------------------------------------------
// Track B — trust and privileges (spec 12)
//
// Invariant I10: nothing in this section writes a ledger entry or alters money.
// ---------------------------------------------------------------------------

export const trustArea = sqliteTable(
  "trust_area",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    drainAmount: integer("drain_amount"),
    drainIntervalHours: integer("drain_interval_hours"),
    capLoad: integer("cap_load"),
    thresholdsJson: text("thresholds_json", { mode: "json" }),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("trust_area_household_idx").on(t.householdId, t.active)],
);

/** Per-child drain and cap: one area moves at different speeds at 7 and at 15. */
export const trustAreaOverride = sqliteTable(
  "trust_area_override",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    trustAreaId: text("trust_area_id")
      .notNull()
      .references(() => trustArea.id, { onDelete: "cascade" }),
    drainAmount: integer("drain_amount"),
    drainIntervalHours: integer("drain_interval_hours"),
    capLoad: integer("cap_load"),
  },
  (t) => [uniqueIndex("trust_override_unique").on(t.childId, t.trustAreaId)],
);

/**
 * Which children an area applies to. A row's presence is the whole signal —
 * every area applies to every child by default (a row per pairing, created
 * when the area or the child is created), and removing a child from an area
 * is exactly deleting their row. A younger sibling with no device yet does
 * not need "Screens" following them around.
 */
export const trustAreaChild = sqliteTable(
  "trust_area_child",
  {
    id: id(),
    trustAreaId: text("trust_area_id")
      .notNull()
      .references(() => trustArea.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("trust_area_child_unique").on(t.trustAreaId, t.childId)],
);

/**
 * Tier 1. Never scored, never paid — displayed as standing expectations.
 * Wording must be observable: "follow directions the first time", not
 * "have a good attitude".
 */
export const houseRule = sqliteTable(
  "house_rule",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    trustAreaId: text("trust_area_id")
      .notNull()
      .references(() => trustArea.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    defaultWeight: integer("default_weight").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("house_rule_household_idx").on(t.householdId, t.active)],
);

/**
 * What happened. Positive weight is an infraction, negative is a credit.
 *
 * Unlike the ledger, a mark may be retracted. This is a parenting tool, not a
 * financial record: a parent who marked something in anger must be able to undo
 * it cleanly.
 */
export const trustMark = sqliteTable(
  "trust_mark",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    trustAreaId: text("trust_area_id")
      .notNull()
      .references(() => trustArea.id, { onDelete: "cascade" }),
    houseRuleId: text("house_rule_id"),
    weight: integer("weight").notNull(),
    note: text("note"),
    occurredAt: integer("occurred_at").notNull().default(now),
    createdByUserId: text("created_by_user_id"),
    retractedAt: integer("retracted_at"),
  },
  (t) => [index("trust_mark_child_idx").on(t.childId, t.occurredAt)],
);

/** The cached bucket, same pattern as account.balance_cents. */
export const trustState = sqliteTable(
  "trust_state",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    trustAreaId: text("trust_area_id")
      .notNull()
      .references(() => trustArea.id, { onDelete: "cascade" }),
    load: integer("load").notNull().default(0),
    lastDrainedAt: integer("last_drained_at").notNull().default(now),
    pinnedLevel: integer("pinned_level"),
    pinExpiresAt: integer("pin_expires_at"),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("trust_state_unique").on(t.childId, t.trustAreaId)],
);

/** Informational only. The app communicates readiness; it never enforces it. */
export const privilege = sqliteTable(
  "privilege",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    trustAreaId: text("trust_area_id")
      .notNull()
      .references(() => trustArea.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    minLevel: integer("min_level").notNull().default(3),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("privilege_household_idx").on(t.householdId, t.active)],
);

/** One line, never a list. A list of a child's failings is a shame board. */
export const focusNote = sqliteTable(
  "focus_note",
  {
    id: id(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("focus_note_child_idx").on(t.childId)],
);

// ---------------------------------------------------------------------------
// Relations

// ---------------------------------------------------------------------------

export const childRelations = relations(child, ({ many, one }) => ({
  accounts: many(account),
  goals: many(goal),
  responsibilities: many(responsibility),
  bills: many(bill),
  payPeriods: many(payPeriod),
  household: one(household, {
    fields: [child.householdId],
    references: [household.id],
  }),
}));

export const accountRelations = relations(account, ({ one, many }) => ({
  child: one(child, { fields: [account.childId], references: [child.id] }),
  entries: many(ledgerEntry),
}));

export const ledgerEntryRelations = relations(ledgerEntry, ({ one }) => ({
  account: one(account, {
    fields: [ledgerEntry.accountId],
    references: [account.id],
  }),
  child: one(child, { fields: [ledgerEntry.childId], references: [child.id] }),
  goal: one(goal, { fields: [ledgerEntry.goalId], references: [goal.id] }),
}));

export const paystubRelations = relations(paystub, ({ one, many }) => ({
  child: one(child, { fields: [paystub.childId], references: [child.id] }),
  payPeriod: one(payPeriod, {
    fields: [paystub.payPeriodId],
    references: [payPeriod.id],
  }),
  lines: many(paystubLine),
}));

export const paystubLineRelations = relations(paystubLine, ({ one }) => ({
  paystub: one(paystub, {
    fields: [paystubLine.paystubId],
    references: [paystub.id],
  }),
}));
