import type { Policy } from "@/lib/policy";

/**
 * Declarative description of the settings catalogue, so the editor UI is
 * generated rather than hand-written twice at two scopes.
 *
 * SPEC §2.2 treats configuration burden as a genuine threat to the project: an
 * application that takes an evening to configure is one you stop opening. Hence
 * `advanced`, which keeps the everyday screen short.
 */

export type FieldSpec = {
  path: string;
  label: string;
  hint?: string;
  type: "select" | "number" | "money" | "boolean" | "percent";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  advanced?: boolean;
};

export type SectionSpec = {
  key: keyof Policy;
  title: string;
  description: string;
  fields: FieldSpec[];
};

export const SETTINGS_SECTIONS: SectionSpec[] = [
  {
    key: "pay",
    title: "Pay schedule",
    description:
      "Pay date is deliberately separate from period end. That gap is what creates 'earned but not yet paid', exactly as a real job does.",
    fields: [
      {
        path: "pay.cadence",
        label: "How often",
        type: "select",
        options: [
          { value: "weekly", label: "Weekly" },
          { value: "biweekly", label: "Every two weeks" },
          { value: "semimonthly", label: "Twice a month" },
          { value: "monthly", label: "Monthly" },
        ],
      },
      {
        path: "pay.periodStartDay",
        label: "Period starts",
        type: "select",
        options: [
          { value: "0", label: "Sunday" },
          { value: "1", label: "Monday" },
          { value: "2", label: "Tuesday" },
          { value: "3", label: "Wednesday" },
          { value: "4", label: "Thursday" },
          { value: "5", label: "Friday" },
          { value: "6", label: "Saturday" },
        ],
      },
      {
        path: "pay.payDateOffsetDays",
        label: "Payday, days after period end",
        hint: "5 means a period ending Sunday pays on Friday.",
        type: "number",
        min: 0,
        max: 31,
      },
      {
        path: "pay.cutoffHour",
        label: "Cutoff hour",
        type: "number",
        min: 0,
        max: 23,
        advanced: true,
      },
      {
        path: "pay.minRevisionHours",
        label: "Minimum revision window (hours)",
        hint: "Only matters if payday is the same day the period ends.",
        type: "number",
        min: 0,
        max: 168,
        advanced: true,
      },
    ],
  },
  {
    key: "completion",
    title: "Marking things done",
    description:
      "Auto-approve with a veto is what makes follow-through nearly automatic: whatever is ticked stands unless you object before the stub posts.",
    fields: [
      {
        path: "completion.mode",
        label: "How completions count",
        type: "select",
        options: [
          { value: "auto_approve_with_veto", label: "Counts unless you object" },
          { value: "claim_then_approve", label: "Child claims, you approve" },
          { value: "parent_marks_only", label: "Only you can mark it" },
        ],
      },
      {
        path: "completion.whoCanClaim",
        label: "Who can tick things off",
        type: "select",
        options: [
          { value: "child_kiosk", label: "Child, at the kiosk" },
          { value: "parent_only", label: "Parents only" },
        ],
      },
      { path: "completion.excusalsEnabled", label: "Allow excused days", type: "boolean" },
    ],
  },
  {
    key: "allocation",
    title: "Allocation",
    description:
      "How a net deposit is split. These must total 100, and every leftover cent goes to the bucket you choose.",
    fields: [
      { path: "allocation.checkingPct", label: "Checking %", type: "percent" },
      { path: "allocation.savingsPct", label: "Savings %", type: "percent" },
      { path: "allocation.generosityPct", label: "Generosity %", type: "percent" },
      {
        path: "allocation.roundingBucket",
        label: "Leftover cents go to",
        type: "select",
        options: [
          { value: "checking", label: "Checking" },
          { value: "savings", label: "Savings" },
          { value: "generosity", label: "Generosity" },
        ],
      },
      {
        path: "allocation.jobPayMode",
        label: "Bonus job pay",
        type: "select",
        options: [
          { value: "inherit", label: "Split like normal pay" },
          { value: "checking_only", label: "Straight to Checking" },
        ],
      },
    ],
  },
  {
    key: "interest",
    title: "Interest",
    description:
      "Accrues daily, pays monthly — what real banks do, and what makes the rate impossible to game by shuffling money before payout.",
    fields: [
      { path: "interest.enabled", label: "Pay interest", type: "boolean" },
      {
        path: "interest.annualRateBp",
        label: "Annual rate (basis points)",
        hint: "1200 is 12% a year, about 1% a month. Deliberately unrealistic — a real rate pays a child pennies they cannot perceive.",
        type: "number",
        min: 0,
        max: 100000,
      },
      {
        path: "interest.compounding",
        label: "Compounding",
        type: "select",
        options: [
          { value: "compound", label: "Compound" },
          { value: "simple", label: "Simple" },
        ],
      },
      {
        path: "interest.postingDayOfMonth",
        label: "Pays on day",
        type: "number",
        min: 1,
        max: 28,
        advanced: true,
      },
    ],
  },
  {
    key: "transfers",
    title: "Moving money",
    description: "What a child may do on their own once they have an account.",
    fields: [
      {
        path: "transfers.checkingToSavings",
        label: "Checking to Savings",
        type: "select",
        options: [
          { value: "free", label: "Freely" },
          { value: "requires_approval", label: "Needs approval" },
        ],
      },
      {
        path: "transfers.savingsToChecking",
        label: "Savings to Checking",
        type: "select",
        options: [
          { value: "requires_approval", label: "Needs approval" },
          { value: "free", label: "Freely" },
        ],
      },
      {
        path: "transfers.unearmark",
        label: "Taking money back off a goal",
        type: "select",
        options: [
          { value: "requires_approval", label: "Needs approval" },
          { value: "free", label: "Freely" },
        ],
      },
      {
        path: "transfers.generosityOut",
        label: "Giving money away",
        type: "select",
        options: [
          { value: "requires_approval", label: "Needs approval" },
          { value: "free", label: "Freely" },
        ],
      },
    ],
  },
  {
    key: "bills",
    title: "Bills",
    description:
      "Defaults for new bills. Each bill keeps its own copy, so changing these never rewrites one already set up.",
    fields: [
      { path: "bills.autopay", label: "Collect automatically", type: "boolean" },
      {
        path: "bills.shortfallPolicy",
        label: "When they cannot pay",
        type: "select",
        options: [
          { value: "partial_pay_carry_remainder", label: "Take what there is, carry the rest" },
          { value: "no_pay_full_carry", label: "Take nothing, carry it all" },
          { value: "waive", label: "Forgive it" },
          { value: "block", label: "Block the charge" },
        ],
      },
      {
        path: "bills.pastDueRecovery",
        label: "Recovering past due",
        type: "select",
        options: [
          { value: "from_gross_before_allocation", label: "Off the top of the next paycheck" },
          { value: "from_checking_after_allocation", label: "From Checking after payday" },
          { value: "manual", label: "Only when you say so" },
        ],
      },
      {
        path: "bills.pastDueMaxRecoveryPct",
        label: "Most of a paycheck that can be taken (%)",
        hint: "At 100 a child two weeks behind gets a $0.00 stub. Lowering it guarantees every payday still deposits something while the debt still stings.",
        type: "percent",
      },
      {
        path: "bills.nonexistentDateRule",
        label: "A bill due on the 31st in February",
        type: "select",
        options: [
          { value: "next_day", label: "Move to the next day" },
          { value: "previous_day", label: "Move to the previous day" },
        ],
        advanced: true,
      },
    ],
  },
  {
    key: "trust",
    title: "Trust",
    description:
      "Marks add load, time drains it. Doing nothing produces recovery, never punishment — the same asymmetry payroll has.",
    fields: [
      { path: "trust.enabled", label: "Use the trust track", type: "boolean" },
      {
        path: "trust.drainAmount",
        label: "Points cleared each interval",
        type: "number",
        min: 1,
        max: 20,
      },
      {
        path: "trust.drainIntervalHours",
        label: "Interval (hours)",
        hint: "2 points every 12 hours against a cap of 6 clears a worst-possible day inside two days.",
        type: "number",
        min: 1,
        max: 168,
      },
      {
        path: "trust.capLoad",
        label: "Most points that can pile up",
        hint: "Bounds the worst case. A consequence a child cannot see the end of has stopped teaching.",
        type: "number",
        min: 1,
        max: 100,
      },
      {
        path: "trust.childVisibility",
        label: "What the child sees",
        hint: "The recovery timeline is always shown. This controls the numbers behind it.",
        type: "select",
        options: [
          { value: "level_only", label: "Level and timeline only" },
          { value: "show_load", label: "Also their points" },
          { value: "show_tariff", label: "Also what each rule costs" },
        ],
      },
      {
        path: "trust.pinDefaultExpiryHours",
        label: "Manual level lasts (hours)",
        type: "number",
        min: 1,
        max: 720,
        advanced: true,
      },
    ],
  },
  {
    key: "display",
    title: "Who shows where",
    description:
      "A child on the trust track before they start earning does not need to appear on a money dashboard. They stay reachable under Children either way.",
    fields: [
      {
        path: "display.showNotYetEarning",
        label: "Show children who are not yet earning on the dashboard",
        type: "boolean",
      },
      {
        path: "display.childOrder",
        label: "Order children by",
        type: "select",
        options: [
          { value: "oldest_first", label: "Oldest first" },
          { value: "youngest_first", label: "Youngest first" },
          { value: "name", label: "Name" },
        ],
      },
    ],
  },
  {
    key: "kiosk",
    title: "Kiosk",
    description:
      "The always-on display. Trust never appears on it, whatever these are set to.",
    fields: [
      {
        path: "kiosk.dashboardMode",
        label: "What it shows",
        type: "select",
        options: [
          { value: "roster", label: "Tap a name to see more" },
          { value: "balances", label: "Everyone's balances" },
          { value: "task_progress", label: "Everyone's progress" },
        ],
      },
      {
        path: "kiosk.showPendingPaycheck",
        label: "Show earned-so-far",
        type: "boolean",
      },
    ],
  },
];

export function getAtPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
