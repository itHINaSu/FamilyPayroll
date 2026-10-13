import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { formatCents } from "@/lib/money";
import {
  describeCadence,
  getResponsibilityTemplate,
  templateChildStatus,
} from "@/lib/responsibilities";
import { NewChildrenToggle, PerChildStatusList } from "../forms";

export const dynamic = "force-dynamic";

/**
 * The rarer half of managing a responsibility: who it applies to. Reached
 * by clicking into the template from the hub, rather than sitting on every
 * card — the common edits (name, pay, cadence) stay one click closer, on
 * the hub itself.
 */
export default async function ResponsibilityDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const parent = await requireParent();
  const template = getResponsibilityTemplate(parent.householdId, templateId);
  if (!template) notFound();

  const statuses = templateChildStatus(parent.householdId, templateId);

  return (
    <>
      <Link
        href="/responsibilities"
        className="mb-2 inline-block text-sm text-ink-400 hover:text-ink-700 hover:underline"
      >
        ← All expectations
      </Link>
      <PageHeader
        title={template.name}
        subtitle={`${formatCents(template.weeklyValueCents)}/week · ${describeCadence(template)} · rename or change the rate from the hub`}
      />

      <div className="mx-auto max-w-xl">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Per child</h2>
          <p className="mb-4 text-xs text-ink-400">
            Turn it off for one child without touching anyone else&apos;s,
            or customize their rate and cadence below.
          </p>
          <PerChildStatusList templateId={templateId} statuses={statuses} />
          <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-700">
            <NewChildrenToggle
              templateId={templateId}
              checked={template.appliesToNewChildren}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
