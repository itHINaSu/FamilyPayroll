import { PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import { listChildren } from "@/lib/children";
import { resolvePolicy } from "@/lib/policy";
import { trustSummary } from "@/lib/trust";
import { ChildPicker } from "../child-picker";

export const dynamic = "force-dynamic";

/**
 * The accounting side of Trust: pick a child, land on their trust page to
 * log a mark — typically a loss, occasionally a credit back. Defining the
 * areas, rules, and privileges that marks are logged against — the
 * template side — is Expectations, reached through Setup instead of here.
 */
export default async function TrustPage() {
  const parent = await requireParent();
  const children = listChildren(parent.householdId);

  const standing = new Map(
    children.map((c) => {
      const policy = resolvePolicy(parent.householdId, c.id);
      if (!policy.trust.enabled) return [c.id, "Trust off for this child"];

      const areas = trustSummary(c.id);
      if (areas.length === 0) return [c.id, null];

      // The worst standing across areas is the one worth a glance at —
      // everything better than that is already fine.
      const lowest = areas.reduce((worst, a) => (a.level.level < worst.level.level ? a : worst));
      return [c.id, lowest.level.name];
    }),
  );

  return (
    <>
      <PageHeader title="Trust" />
      <ChildPicker
        children={children}
        hrefFor={(id) => `/children/${id}/trust`}
        subtitleFor={(id) => standing.get(id) ?? null}
        emptyMessage="No children yet — add one from Balances first."
      />
    </>
  );
}
