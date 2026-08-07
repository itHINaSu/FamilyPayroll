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
import { AddChildForm, AddChildToggle } from "./add-child-form";
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

      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-4">
          {activeChildren.length === 0 && (
            <Alert tone="info">
              No children yet. Add your first one to get started.
            </Alert>
          )}

          {activeChildren.map((c) => (
            <Card key={c.id}>
              {/*
                Two explicit rows below sm, one row from sm up — deterministic
                rather than left to flex-wrap's shrink-first behaviour, which
                truncated the name down to three or four letters before ever
                giving up the line to the balance and Archive button. The
                second row is indented to line up under the name (avatar width
                + gap), and min-w-0 on the name block is what lets `truncate`
                actually clip instead of forcing the row wider.
              */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 items-center gap-4">
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

                  <div className="min-w-0">
                    <Link
                      href={`/children/${c.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {c.displayName}
                    </Link>
                    <p className="truncate text-sm text-ink-400">
                      {ageFromBirthdate(c.birthdate)} years old ·{" "}
                      {CHILD_STATUS_LABELS[c.status]}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pl-[72px] sm:pl-0">
                  <div className="text-right">
                    <p className="tnum text-lg">
                      {formatCents(getBalances(c.id).visibleTotal)}
                    </p>
                    <p className="text-xs text-ink-400">total</p>
                  </div>

                  <ArchiveButton childId={c.id} name={c.displayName} />
                </div>
              </div>
            </Card>
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
