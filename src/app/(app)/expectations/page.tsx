import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { householdWeek } from "@/lib/today";
import { WeekCard } from "./week-card";

export const dynamic = "force-dynamic";

/**
 * This week, every child: each expectation as a row of boxes. Defining
 * expectations and what they pay is Setup (/responsibilities).
 */
export default async function ExpectationsPage() {
  const parent = await requireParent();
  const { today, children } = householdWeek(parent.householdId);

  return (
    <>
      <PageHeader title="Expectations" />
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
