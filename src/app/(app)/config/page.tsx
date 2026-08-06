import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { job, trustArea } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { pendingJobClaims } from "@/lib/jobs";
import { listHouseRules } from "@/lib/trust";

export const dynamic = "force-dynamic";

/**
 * The setup hub.
 *
 * Everything that is configured occasionally rather than used daily — the job
 * board, house rules, notifications, and settings — used to sit on the same
 * shelf as Today and Children in the top nav, which flattened the rare next to
 * the daily and was a real contributor to the app feeling like more setup than
 * it is. This page is that shelf instead: one click from the top nav, and each
 * destination is still one click from here.
 */
export default async function ConfigPage() {
  const parent = await requireParent();

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
      href: "/settings",
      title: "Settings",
      description:
        "Pay schedule, allocation, bills, trust, and everything else — household defaults, overridable per child.",
      detail: null,
    },
    {
      href: "/jobs",
      title: "Job board",
      description: "Extra work for extra pay, claimed rather than assigned.",
      detail: `${activeJobs} job${activeJobs === 1 ? "" : "s"} posted${
        pendingClaims > 0 ? ` · ${pendingClaims} waiting on you` : ""
      }`,
    },
    {
      href: "/house-rules",
      title: "House rules",
      description:
        "Never scored, never paid — what it means to be a member of this family.",
      detail: `${houseRuleCount} rule${houseRuleCount === 1 ? "" : "s"} across ${areaCount} area${
        areaCount === 1 ? "" : "s"
      }`,
    },
    {
      href: "/notifications",
      title: "Notifications",
      description:
        "Nudges toward follow-through. Nothing in the system depends on you seeing one.",
      detail: null,
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
