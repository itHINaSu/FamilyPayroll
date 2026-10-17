import { and, eq } from "drizzle-orm";

import { Alert, Card } from "@/components/ui";
import { SettingsEditor } from "@/components/settings-editor";
import { db } from "@/db";
import { payPeriod, paystub } from "@/db/schema";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { heldFundTotal } from "@/lib/bills";
import { listEarningChildren } from "@/lib/children";
import { todayInHousehold } from "@/lib/dates";
import { matchesSchedule, unpaidPeriods } from "@/lib/payroll";
import { formatCents } from "@/lib/money";
import {
  checkGuardrails,
  getOverrides,
  resolveHouseholdPolicy,
  resolvePolicy,
} from "@/lib/policy";
import { periodChoice, scheduledChanges } from "@/lib/policy-schedule";
import { PayrollControl } from "../payroll-control";
import { SectionHeader } from "../section-header";
import { PayNow, type PayNowRow } from "./pay-now";

export const dynamic = "force-dynamic";

const PAYROLL_SECTIONS = ["pay", "completion", "allocation", "interest", "transfers", "bills"];

export default async function PayrollSettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const overrides = getOverrides("household", parent.householdId);
  const warnings = checkGuardrails(policy);
  const held = heldFundTotal(parent.householdId);

  const today = todayInHousehold();
  // Each child's waiting drafts, then whatever isn't drafted yet: a period
  // that has ended and is due, and the one running now.
  const payNow: PayNowRow[] = listEarningChildren(parent.householdId, {
    showNotYetEarning: false,
    order: policy.display.childOrder,
  }).flatMap((c) => {
    const drafts = db
      .select({ id: paystub.id, period: payPeriod })
      .from(paystub)
      .innerJoin(payPeriod, eq(paystub.payPeriodId, payPeriod.id))
      .where(and(eq(paystub.childId, c.id), eq(paystub.status, "draft")))
      .all()
      .filter((d) => matchesSchedule(parent.householdId, c.id, d.period));
    const rows = [
      ...drafts.map((d) => ({
        startDate: d.period.startDate,
        endDate: d.period.endDate,
        payDate: d.period.payDate,
        draftStubId: d.id as string | null,
      })),
      ...unpaidPeriods(parent.householdId, c.id, today)
        .filter((p) => !drafts.some((d) => d.period.startDate === p.startDate))
        .map((p) => ({ ...p, draftStubId: null })),
    ].sort((a, b) => a.startDate.localeCompare(b.startDate));
    return rows.map((r) => ({
      childId: c.id,
      name: c.displayName,
      startDate: r.startDate,
      endDate: r.endDate,
      payDate: r.payDate,
      draftStubId: r.draftStubId,
    }));
  });

  return (
    <>
      <SectionHeader title="Payroll" />
      <div className="mx-auto max-w-2xl space-y-6">
        {warnings.map((w) => (
          <Alert key={w.field} tone="warning">
            {w.message}
          </Alert>
        ))}

        <PayrollControl pausedOn={home?.payrollPausedOn ?? null} />

        {!home?.payrollPausedOn && <PayNow rows={payNow} today={today} />}

        {held > 0 && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Held for the children</h2>
            <p className="mb-3 text-xs text-ink-400">
              Money collected from bills set to be held. Parents only — never shown to a
              child or on the kiosk.
            </p>
            <p className="tnum text-3xl">{formatCents(held)}</p>
          </Card>
        )}

        <p className="text-xs text-ink-400">
          These are the family defaults. Any child can differ — Settings › Household, then the child.
        </p>
        <SettingsEditor
          scopeType="household"
          scopeId={parent.householdId}
          effective={policy}
          overriddenSections={Object.keys(overrides)}
          sections={PAYROLL_SECTIONS}
          period={periodChoice(parent.householdId, null, today)}
          scheduled={scheduledChanges(parent.householdId, "household", parent.householdId, today)}
        />
      </div>
    </>
  );
}
