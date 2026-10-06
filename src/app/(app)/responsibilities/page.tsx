import { Alert, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { listResponsibilityTemplates, templateChildStatus } from "@/lib/responsibilities";
import { AddTemplateForm, TemplateCard } from "./forms";

export const dynamic = "force-dynamic";

/**
 * The family-level editor.
 *
 * A responsibility is created once here and applies to every child by
 * default — a per-child copy still exists underneath (payroll and
 * completions need something concrete to read), but this is the surface a
 * parent uses day to day: add it once, turn it off for one kid, or give one
 * kid a different rate, all without touching anyone else's.
 */
export default async function ResponsibilitiesHubPage() {
  const parent = await requireParent();
  const templates = listResponsibilityTemplates(parent.householdId);
  const children = listChildren(parent.householdId);

  return (
    <>
      <PageHeader
        title="Responsibilities"
        subtitle="The paid work. Name, pay, and cadence are editable right here — click into one to turn it off or on for a specific child."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {templates.length === 0 ? (
            <Alert tone="info">
              Nothing set up yet. Add the first one below.
            </Alert>
          ) : (
            templates.map((t) => {
              const statuses = templateChildStatus(parent.householdId, t.id);
              return (
                <TemplateCard
                  key={t.id}
                  template={{
                    id: t.id,
                    name: t.name,
                    weeklyValueCents: t.weeklyValueCents,
                    cadence: t.cadence,
                    daysOfWeek: t.daysOfWeek,
                    maxOccurrences: t.maxOccurrences,
                  }}
                  activeCount={statuses.filter((s) => s.enabled).length}
                  totalChildren={statuses.length}
                />
              );
            })
          )}

          {children.length === 0 && (
            <Alert tone="warning">
              No children yet — a template will apply automatically the
              moment one is added.
            </Alert>
          )}
        </div>

        <AddTemplateForm />
      </div>
    </>
  );
}
