import Link from "next/link";
import { notFound } from "next/navigation";

import { SettingsEditor } from "@/components/settings-editor";
import { Alert, BackChevron, Button, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { ageFromBirthdate, getChild } from "@/lib/children";
import { checkGuardrails, getOverrides, resolvePolicy } from "@/lib/policy";
import { listResponsibilities } from "@/lib/responsibilities";
import { clearChildOverrides } from "@/app/(app)/settings/actions";
import { EditChildForm } from "./edit-child-form";
import { RaiseForm } from "./raise-form";

export const dynamic = "force-dynamic";

/**
 * Setup › Children › one child: who they are, a raise, and any pay rules that
 * differ from the family's. Day-to-day is on the Expectations and Balances tabs.
 */
export default async function ChildSetupPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const parent = await requireParent();
  const record = getChild(parent.householdId, childId);
  if (!record) notFound();

  const policy = resolvePolicy(parent.householdId, childId);
  const overrides = getOverrides("child", childId);
  const overriddenSections = Object.keys(overrides);
  const warnings = checkGuardrails(policy, ageFromBirthdate(record.birthdate));

  return (
    <>
      <PageHeader
        title={record.displayName}
        back={
          <Link href="/children" title="Children">
            <BackChevron label="Children" />
          </Link>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {warnings.map((w) => (
          <Alert key={w.field} tone="warning">
            {w.message}
          </Alert>
        ))}

        <EditChildForm
          child={{
            id: record.id,
            displayName: record.displayName,
            birthdate: record.birthdate,
            status: record.status,
            photoBlobId: record.photoBlobId,
          }}
        />

        <RaiseForm
          childId={childId}
          responsibilities={listResponsibilities(childId).map((r) => ({ id: r.id, name: r.name }))}
        />

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Pay rules for {record.displayName}</h2>
              <p className="mt-1 text-xs text-ink-400">
                {overriddenSections.length === 0
                  ? "Following every family default (Settings › Payroll). Change a section below to differ."
                  : `Different from the family in: ${overriddenSections.join(", ")}.`}
              </p>
            </div>
            {overriddenSections.length > 0 && (
              <form action={clearChildOverrides}>
                <input type="hidden" name="childId" value={childId} />
                <Button type="submit" variant="secondary" className="whitespace-nowrap">
                  Use family rules
                </Button>
              </form>
            )}
          </div>
        </Card>

        <SettingsEditor
          scopeType="child"
          scopeId={childId}
          effective={policy}
          overriddenSections={overriddenSections}
        />
      </div>
    </>
  );
}
