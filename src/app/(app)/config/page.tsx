import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { job, trustArea } from "@/db/schema";
import { listBills } from "@/lib/bills";
import { requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { pendingJobClaims } from "@/lib/jobs";
import { listResponsibilities } from "@/lib/responsibilities";
import { listHouseRules } from "@/lib/trust";

export const dynamic = "force-dynamic";

/**
 * The setup hub.
 *
 * Everything that is configured occasionally rather than used daily — the
 * children roster, the paid work, character expectations, extra jobs, and
 * bills — used to sit on the same shelf as Dashboard in the top nav, which
 * flattened the rare next to the daily and was a real contributor to the app
 * feeling like more setup than it is. This page is that shelf instead: one
 * click from the top nav, and each destination is still one click from here.
 * Account-level Settings and Notifications live under their own Settings tab,
 * not here — those are "how the app behaves," not "what is set up."
 */
export default async function ConfigPage() {
  const parent = await requireParent();

  const children = listChildren(parent.householdId);

  const responsibilityCount = children.reduce(
    (sum, c) => sum + listResponsibilities(c.id).length,
    0,
  );
  const billCount = children.reduce((sum, c) => sum + listBills(c.id).length, 0);

  const activeJobs = db
    .select({ id: job.id })
    .from(job)
    .where(and(eq(job.householdId, parent.householdId), eq(job.active, true)))
    .all().length;

  const pendingClaims = pendingJobClaims(parent.householdId).length;
  const houseRuleCount = listHouseRules(parent.householdId).length;

  const areaCount = db
    .select({ id: trustArea.id })
    .from(trustArea)
    .where(and(eq(trustArea.householdId, parent.householdId), eq(trustArea.active, true)))
    .all().length;

  const cards = [
    {
      href: "/children",
      title: "Children",
      description: "Add a child as they are born, archive them as they grow out.",
      detail: `${children.length} child${children.length === 1 ? "" : "ren"}`,
    },
    {
      href: "/responsibilities",
      title: "Responsibilities",
      description: "The paid work — a fixed weekly ceiling per child.",
      detail: `${responsibilityCount} across ${children.length} child${children.length === 1 ? "" : "ren"}`,
    },
    {
      href: "/expectations",
      title: "Expectations",
      description:
        "Never scored, never paid — what it means to be a member of this family.",
      detail: `${houseRuleCount} rule${houseRuleCount === 1 ? "" : "s"} across ${areaCount} area${
        areaCount === 1 ? "" : "s"
      }`,
    },
    {
      href: "/jobs",
      title: "Extra jobs",
      description: "Extra work for extra pay, claimed rather than assigned.",
      detail: `${activeJobs} job${activeJobs === 1 ? "" : "s"} posted${
        pendingClaims > 0 ? ` · ${pendingClaims} waiting on you` : ""
      }`,
    },
    {
      href: "/bills",
      title: "Bills",
      description: "Rent and anything else due whether or not a paycheck was earned.",
      detail: `${billCount} bill${billCount === 1 ? "" : "s"} across ${children.length} child${children.length === 1 ? "" : "ren"}`,
    },
  ];

  return (
    <>
      <PageHeader title="Setup" subtitle="Configured occasionally, not daily." />

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="block">
            <Card className="h-full transition hover:border-ledger-500">
              <h2 className="font-semibold">{c.title}</h2>
              <p className="mt-1 text-sm text-ink-400">{c.description}</p>
              {c.detail && (
                <p className="mt-3 text-xs font-medium text-ink-500 dark:text-ink-300">
                  {c.detail}
                </p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
