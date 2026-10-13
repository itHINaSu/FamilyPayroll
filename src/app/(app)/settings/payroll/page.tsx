import { Alert, Card } from "@/components/ui";
import { SettingsEditor } from "@/components/settings-editor";
import { getHousehold, requireParent } from "@/lib/auth/guard";
import { heldFundTotal } from "@/lib/bills";
import { formatCents } from "@/lib/money";
import { checkGuardrails, getOverrides, resolveHouseholdPolicy } from "@/lib/policy";
import { PayrollControl } from "../payroll-control";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

const PAYROLL_SECTIONS = ["pay", "completion", "allocation", "interest", "transfers", "bills"];

export default async function PayrollSettingsPage() {
  const parent = await requireParent();
  const home = getHousehold();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const overrides = getOverrides("household", parent.householdId);
  const warnings = checkGuardrails(policy);
  const held = heldFundTotal(parent.householdId);

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
          These are the family defaults. Any child can differ — open the child and tap the gear.
        </p>
        <SettingsEditor
          scopeType="household"
          scopeId={parent.householdId}
          effective={policy}
          overriddenSections={Object.keys(overrides)}
          sections={PAYROLL_SECTIONS}
        />
      </div>
    </>
  );
}
