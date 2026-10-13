import Link from "next/link";

import { Alert, Card, PageHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth/guard";
import {
  ageFromBirthdate,
  CHILD_STATUS_LABELS,
  listChildren,
} from "@/lib/children";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { AddChildForm, AddChildToggle } from "./add-child-form";
import { ChevronRightIcon } from "../icons";
import { RestoreButton } from "./row-actions";

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
      <PageHeader title="Children" />

      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-4">
          {activeChildren.length === 0 && (
            <Alert tone="info">
              No children yet. Add your first one to get started.
            </Alert>
          )}

          {activeChildren.map((c) => (
            <Link key={c.id} href={`/children/${c.id}`} className="block">
              <Card className="flex items-center gap-4 transition hover:border-ledger-500">
                {c.photoBlobId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/blobs/${c.photoBlobId}`}
                    alt=""
                    className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-ink-100 text-lg font-semibold text-ink-400 dark:bg-ink-700">
                    {c.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.displayName}</p>
                  <p className="truncate text-sm text-ink-400">
                    {ageFromBirthdate(c.birthdate)} years old · {CHILD_STATUS_LABELS[c.status]}
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-300 dark:text-ink-500" />
              </Card>
            </Link>
          ))}
        </div>

        <div>
          {activeChildren.length === 0 ? (
            // First-run: nothing to de-emphasize against yet, so the form
            // is shown outright rather than behind a link.
            <AddChildForm siblings={[]} />
          ) : (
            <AddChildToggle
              siblings={activeChildren.map((c) => ({ id: c.id, name: c.displayName }))}
            />
          )}
        </div>

        {archivedChildren.length > 0 && (
          <div className="pt-2">
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
    </>
  );
}
