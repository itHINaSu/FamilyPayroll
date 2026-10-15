import { Alert } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { billTemplateChildStatus, listBillTemplates } from "@/lib/bills";
import { listChildren } from "@/lib/children";
import { AddTemplateForm, TemplateCard } from "./forms";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeBillCadence(cadence: string, dueDay: number): string {
  return cadence === "monthly" ? `Day ${dueDay} of the month` : `Every ${WEEKDAYS[dueDay]}`;
}

/**
 * The family-level editor for bills — the same pattern as Responsibilities:
 * created once, applied to every child by default, turned off or
 * customized per child without touching anyone else's.
 */
export default async function BillsHubPage() {
  const parent = await requireParent();
  const templates = listBillTemplates(parent.householdId);
  const kids = listChildren(parent.householdId);

  return (
    <>
      <SectionHeader title="Bills" />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {templates.length === 0 ? (
            <Alert tone="info">Nothing set up yet. Add the first one below.</Alert>
          ) : (
            templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={{
                  id: t.id,
                  name: t.name,
                  amountCents: t.amountCents,
                  cadence: t.cadence,
                  dueDay: t.dueDay,
                  disposition: t.disposition,
                  sourceAccountOrder: t.sourceAccountOrder,
                  autopay: t.autopay,
                  mayUseEarmarked: t.mayUseEarmarked,
                  cadenceLabel: describeBillCadence(t.cadence, t.dueDay),
                  appliesToNewChildren: t.appliesToNewChildren,
                }}
                statuses={billTemplateChildStatus(parent.householdId, t.id)}
              />
            ))
          )}
        </div>

        <AddTemplateForm kids={kids.map((c) => ({ id: c.id, name: c.displayName }))} />
      </div>
    </>
  );
}
