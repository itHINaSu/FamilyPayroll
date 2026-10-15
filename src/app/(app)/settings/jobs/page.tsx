import { and, eq } from "drizzle-orm";

import { Alert, Button, Card } from "@/components/ui";
import { db } from "@/db";
import { child, job } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { pendingJobClaims, REPEAT_LABELS } from "@/lib/jobs";
import { formatCents } from "@/lib/money";
import { decideClaim } from "./actions";
import { AddJobForm } from "./form";
import { JobRow } from "./job-row";
import { SectionHeader } from "../section-header";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const parent = await requireParent();

  const jobs = db
    .select()
    .from(job)
    .where(and(eq(job.householdId, parent.householdId), eq(job.active, true)))
    .orderBy(job.name)
    .all();

  const children = db
    .select()
    .from(child)
    .where(and(eq(child.householdId, parent.householdId), eq(child.status, "active")))
    .all();

  const pending = pendingJobClaims(parent.householdId);
  const childName = new Map(children.map((c) => [c.id, c.displayName]));

  return (
    <>
      <SectionHeader title="Extra jobs" />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {pending.length > 0 && (
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Waiting on you</h2>
              <ul className="space-y-3">
                {pending.map(({ claim, jobRow }) => (
                  <li
                    key={claim.id}
                    className="flex items-center justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0 dark:border-ink-700"
                  >
                    <div>
                      <p className="text-sm font-medium">{jobRow.name}</p>
                      <p className="text-xs text-ink-400">
                        {childName.get(claim.childId) ?? "A child"} ·{" "}
                        {formatCents(claim.valueCentsSnapshot)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <form action={decideClaim}>
                        <input type="hidden" name="claimId" value={claim.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <Button type="submit" className="!px-3 !py-1 text-xs">
                          Approve
                        </Button>
                      </form>
                      <form action={decideClaim}>
                        <input type="hidden" name="claimId" value={claim.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <Button
                          type="submit"
                          variant="secondary"
                          className="!px-3 !py-1 text-xs"
                        >
                          Not yet
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Jobs on offer</h2>

            {jobs.length === 0 ? (
              <Alert tone="info">
                No jobs yet. Around nine or ten a flat weekly rate starts to feel
                stale — a board of one-off work is what keeps earning interesting.
              </Alert>
            ) : (
              <ul className="space-y-3">
                {jobs.map((j) => {
                  const repeatLabel =
                    REPEAT_LABELS[j.repeatRule] +
                    (j.repeatRule === "every_n_days" ? ` (${j.repeatN} days)` : "");
                  const eligibleLabel =
                    `${j.limitCount}× ${j.limitScope === "per_child" ? "per child" : "total"}` +
                    (j.eligibleChildIds?.length
                      ? ` · ${j.eligibleChildIds.map((id) => childName.get(id)).join(", ")}`
                      : " · anyone");

                  return (
                    <JobRow
                      key={j.id}
                      job={j}
                      repeatLabel={repeatLabel}
                      eligibleLabel={eligibleLabel}
                      children={children.map((c) => ({ id: c.id, name: c.displayName }))}
                    />
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <AddJobForm
          children={children.map((c) => ({ id: c.id, name: c.displayName }))}
        />
      </div>
    </>
  );
}
