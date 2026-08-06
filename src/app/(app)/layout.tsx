import Link from "next/link";

import { requireUser } from "@/lib/auth/guard";
import { getHousehold } from "@/lib/auth/guard";
import { logout } from "@/app/login/actions";

/**
 * Never prerendered: this page reads the session cookie and the database, both
 * of which only exist at request time. Without this, `next build` would bake a
 * snapshot of an empty database into the image.
 */
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/children", label: "Children" },
  { href: "/settings", label: "Settings" },
];

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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              Family Payroll
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-ink-500 transition hover:text-ink-900 dark:text-ink-300 dark:hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-400 sm:inline">
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

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
