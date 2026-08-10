"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BriefcaseIcon, HomeIcon, PeopleIcon, ReceiptIcon } from "./icons";

const TABS = [
  { href: "/", label: "Dashboard", icon: HomeIcon, match: (p: string) => p === "/" },
  {
    href: "/children",
    label: "Children",
    icon: PeopleIcon,
    match: (p: string) => p.startsWith("/children"),
  },
  {
    href: "/jobs",
    label: "Jobs",
    icon: BriefcaseIcon,
    match: (p: string) => p.startsWith("/jobs"),
  },
  {
    href: "/bills",
    label: "Bills",
    icon: ReceiptIcon,
    match: (p: string) => p.startsWith("/bills"),
  },
];

/**
 * The four screens a parent actually opens day to day, one tap away at all
 * times — everything configured occasionally rather than used daily
 * (Responsibilities, Expectations, the Setup overview, Settings) lives
 * behind the hamburger menu instead of competing for a slot down here.
 */
export function BottomTabs({ pendingJobs = 0 }: { pendingJobs?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 backdrop-blur
        dark:border-ink-700 dark:bg-ink-800/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-5xl">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition"
            >
              <span className="relative">
                <Icon
                  className={`h-6 w-6 ${
                    active
                      ? "text-ledger-600 dark:text-ledger-500"
                      : "text-ink-400 dark:text-ink-500"
                  }`}
                />
                {tab.href === "/jobs" && pendingJobs > 0 && (
                  <span
                    aria-label={`${pendingJobs} waiting on you`}
                    className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center
                      rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
                  >
                    {pendingJobs > 9 ? "9+" : pendingJobs}
                  </span>
                )}
              </span>
              <span
                className={
                  active
                    ? "font-medium text-ink-900 dark:text-white"
                    : "text-ink-400 dark:text-ink-500"
                }
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
