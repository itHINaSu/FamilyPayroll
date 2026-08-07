import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { getHousehold } from "@/lib/auth/guard";
import { Nav } from "./nav";
import { UserMenu } from "./user-menu";

/**
 * Never prerendered: this page reads the session cookie and the database, both
 * of which only exist at request time. Without this, `next build` would bake a
 * snapshot of an empty database into the image.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await requireUser();
  // The single choke point: every route under this layout is the parent
  // management app. A child-role session belongs at /me — its own
  // read-only view through the same kiosk boundary (I4, I11) that keeps
  // the held account, bill dispositions, and a sibling's trust off of it.
  if (sessionUser.role === "child") redirect("/me");

  const home = getHousehold();

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800">
        {/*
          flex-wrap rather than a fixed single row: logo+nav and the account
          menu are each one flex item, so on a phone narrow enough that both
          do not fit on one line, the second group drops to its own line
          instead of overflowing the screen or clipping. On anything past a
          small phone they still sit on one row exactly as before.
        */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:gap-x-6 sm:px-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              Family Payroll
            </Link>
            <Nav />
          </div>

          <UserMenu displayName={sessionUser.displayName} householdName={home?.name} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
