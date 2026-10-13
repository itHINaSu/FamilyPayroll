import Link from "next/link";

import { JumpRow } from "@/components/jump-row";
import { Alert, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { householdWeek } from "@/lib/today";
import { WeekCard } from "./week-card";

export const dynamic = "force-dynamic";

/**
 * This week, every child: each expectation as a row of boxes — the "at
 * home" tab, where boxes get checked and misses noted. A child's name opens
 * their whole pay period. Defining expectations is Setup (/responsibilities).
 */
export default async function ExpectationsPage() {
  const parent = await requireParent();
  const { today, children } = householdWeek(parent.householdId);

  return (
    <>
      <PageHeader title="Expectations">
        <JumpRow
          kids={children.map((c) => ({ id: c.id, name: c.name, photoBlobId: c.photoBlobId }))}
        />
      </PageHeader>
      {children.length === 0 ? (
        <Alert tone="info">
          No children yet —{" "}
          <Link href="/children" className="font-medium underline">
            add one under Setup › Children
          </Link>
          .
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {children.map((c) => (
            <WeekCard key={c.id} child={c} today={today} />
          ))}
        </div>
      )}
    </>
  );
}
