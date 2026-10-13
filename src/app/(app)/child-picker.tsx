import Link from "next/link";

import { Alert, Card } from "@/components/ui";
import { ChevronRightIcon } from "./icons";

/**
 * "A list of children, quickly select one" — the entry point shared by the
 * Balances tab. A picker in front of an existing
 * per-child page that already does the real work (the completion grid, the
 * money page) rather than a new surface duplicating it.
 */
export function ChildPicker({
  children,
  hrefFor,
  subtitleFor,
  emptyMessage,
}: {
  children: { id: string; displayName: string; photoBlobId: string | null }[];
  hrefFor: (childId: string) => string;
  /** A one-line "why you'd tap this one" hint — today's count, current
   * whatever is relevant to the tab this picker is on. */
  subtitleFor?: (childId: string) => string | null;
  emptyMessage: string;
}) {
  if (children.length === 0) {
    return <Alert tone="info">{emptyMessage}</Alert>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {children.map((c) => {
        const subtitle = subtitleFor?.(c.id);
        return (
          <Link key={c.id} href={hrefFor(c.id)} className="block">
            <Card className="flex items-center gap-4 !p-4 transition hover:border-ledger-500">
              {c.photoBlobId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/blobs/${c.photoBlobId}`}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-ink-100 font-semibold text-ink-400 dark:bg-ink-700">
                  {c.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.displayName}</span>
                {subtitle && (
                  <span className="block text-xs text-ink-400">{subtitle}</span>
                )}
              </span>
              <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-ink-300 dark:text-ink-500" />
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
