import Link from "next/link";

import { Alert, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import {
  ageFromBirthdate,
  CHILD_STATUS_LABELS,
  listChildren,
} from "@/lib/children";
import { getBalances } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { AddChildForm } from "./add-child-form";
import { ArchiveButton, RestoreButton } from "./row-actions";

export default async function ChildrenPage() {
  const parent = await requireParent();
  const policy = resolveHouseholdPolicy(parent.householdId);
  const children = listChildren(parent.householdId, {
    includeArchived: true,
    order: policy.display.childOrder,
  });

  const activeChildren = children.filter((c) => c.status !== "archived");
  const archivedChildren = children.filter((c) => c.status === "archived");

  return (
    <>
      <PageHeader
        title="Children"
        subtitle="Balances, history, and settings for each child. Add one as they are born; archive them as they grow out. Nothing is ever deleted."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {activeChildren.length === 0 && (
            <Alert tone="info">
              No children yet. Add your first one to get started.
            </Alert>
          )}

          {activeChildren.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center gap-4">
                {c.photoBlobId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/blobs/${c.photoBlobId}`}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-lg font-semibold text-ink-400 dark:bg-ink-700">
                    {c.displayName.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1">
                  <Link
                    href={`/children/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.displayName}
                  </Link>
                  <p className="text-sm text-ink-400">
                    {ageFromBirthdate(c.birthdate)} years old ·{" "}
                    {CHILD_STATUS_LABELS[c.status]}
                  </p>
                </div>

                <div className="text-right">
                  <p className="tnum text-lg">
                    {formatCents(getBalances(c.id).visibleTotal)}
                  </p>
                  <p className="text-xs text-ink-400">total</p>
                </div>

                <ArchiveButton childId={c.id} name={c.displayName} />
              </div>
            </Card>
          ))}

          {archivedChildren.length > 0 && (
            <div className="pt-4">
              <h2 className="mb-3 text-sm font-medium text-ink-400">Archived</h2>
              <div className="space-y-2">
                {archivedChildren.map((c) => (
                  <Card key={c.id} className="!p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="text-sm font-medium">{c.displayName}</span>
                        <span className="ml-2 text-xs text-ink-400">
                          history retained
                        </span>
                      </div>
                      <RestoreButton childId={c.id} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        <AddChildForm
          siblings={activeChildren.map((c) => ({ id: c.id, name: c.displayName }))}
        />
      </div>
    </>
  );
}
