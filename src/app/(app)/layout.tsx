import Link from "next/link";

import { requireUser } from "@/lib/auth/guard";
import { getHousehold } from "@/lib/auth/guard";
import { logout } from "@/app/login/actions";
import { Nav } from "./nav";

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
  const home = getHousehold();

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800">
        {/*
          flex-wrap rather than a fixed single row: logo+nav and name+sign-out
          are each one flex item, so on a phone narrow enough that both do not
          fit on one line, the second group drops to its own line instead of
          overflowing the screen or clipping. On anything past a small phone
          they still sit on one row exactly as before.
        */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:gap-x-6 sm:px-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              Family Payroll
            </Link>
            <Nav />
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-400 md:inline">
              {sessionUser.displayName} · {home?.name}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-ink-500 transition hover:text-ink-900 dark:text-ink-300 dark:hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
