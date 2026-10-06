import { PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { todayForHousehold } from "@/lib/today";
import { ChildPicker } from "../child-picker";

export const dynamic = "force-dynamic";

/**
 * The accounting side of Responsibilities: pick a child, land on their
 * completion grid for this pay period. Defining what a responsibility is
 * and what it pays — the template side — lives at /responsibilities
 * instead, reached through Setup rather than this tab.
 */
export default async function ChoresPage() {
  const parent = await requireParent();
  const children = listChildren(parent.householdId);
  const { children: todayChildren } = todayForHousehold(parent.householdId);

  const progress = new Map(
    todayChildren.map((c) => {
      const dueToday = c.items.filter((i) => i.dueToday && !i.excusedToday);
      const doneCount = dueToday.filter((i) => i.doneToday).length;
      return [c.id, dueToday.length > 0 ? `${doneCount}/${dueToday.length} today` : null];
    }),
  );

  return (
    <>
      <PageHeader title="Chores" />
      <ChildPicker
        children={children}
        hrefFor={(id) => `/children/${id}/responsibilities`}
        subtitleFor={(id) => progress.get(id) ?? null}
        emptyMessage="No children yet — add one under Setup › Children first."
      />
    </>
  );
}
