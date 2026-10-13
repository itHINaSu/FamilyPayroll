import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { getHousehold } from "@/lib/auth/guard";
import { pendingJobClaims } from "@/lib/jobs";
import { AppMenu } from "./app-menu";
import { BottomTabs } from "./bottom-tabs";
import { TopTabs } from "./top-tabs";

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
  // the held account and bill dispositions off of it.
  if (sessionUser.role === "child") redirect("/me");

  const home = getHousehold();
  const pendingJobs = pendingJobClaims(sessionUser.householdId).length;

  return (
    <div className="min-h-screen">
      {/* Hidden in the installed app on a phone (globals.css .app-header):
          the bottom bar covers navigation and its Settings tab opens the
          menu, so the title bar would only repeat the app's name. */}
      <header className="app-header border-b border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              Family Payroll
            </Link>
            {/* Same five destinations as the phone's bottom bar, laid out as
                a row instead — a bar fixed to the bottom of a wide window
                isn't a pattern anyone expects on desktop. */}
            <TopTabs />
          </div>

          {/*
            On a phone, daily-use screens live one tap away in the bottom
            tab bar, so the hamburger only needs to reach the rest — Setup
            (expandable to each of its sections) and the account. Extra
            jobs isn't a tab of its own, so a pending-claims badge rides on
            the hamburger instead of disappearing entirely.
          */}
          <AppMenu
            displayName={sessionUser.displayName}
            username={sessionUser.email}
            householdName={home?.name}
            pendingJobs={pendingJobs}
          />
        </div>
      </header>

      {/* pb-28 clears the fixed bottom tab bar on a phone, home-indicator
          inset included, with some slack. Desktop has no fixed bar, so it
          reverts to the normal amount of breathing room. */}
      <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 md:pb-8">{children}</main>

      <BottomTabs pendingJobs={pendingJobs} />
    </div>
  );
}
