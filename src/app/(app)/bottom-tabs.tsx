"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChecklistIcon, GearIcon, HomeIcon, ShieldIcon, WalletIcon } from "./icons";

const TABS = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/responsibilities", label: "Responsibilities", icon: ChecklistIcon },
  { href: "/expectations", label: "Trust", icon: ShieldIcon },
  { href: "/children", label: "Balances", icon: WalletIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
] as const;

/**
 * Which tab a given path belongs to, checked in priority order rather than
 * each tab testing independently — a per-child page can plausibly match more
 * than one tab's prefix (e.g. /children/[id]/responsibilities is under both
 * /children and "responsibilities"), and only one tab may ever show active.
 */
function activeTab(pathname: string): string | null {
  if (pathname === "/") return "/";
  if (pathname.includes("/responsibilities")) return "/responsibilities";
  if (pathname.startsWith("/expectations") || pathname.includes("/trust")) return "/expectations";
  if (pathname.startsWith("/settings")) return "/settings";
  if (pathname.startsWith("/children")) return "/children";
  return null;
}

/**
 * The five screens one tap away at all times. Deliberately not fixed forever
 * — this set is the current best guess at what a parent reaches for daily,
 * and it's expected to be revisited.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const active = activeTab(pathname);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 backdrop-blur
        dark:border-ink-700 dark:bg-ink-800/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-5xl">
        {TABS.map((tab) => {
          const isActive = tab.href === active;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition"
            >
              <Icon
                className={`h-6 w-6 ${
                  isActive
                    ? "text-ledger-600 dark:text-ledger-500"
                    : "text-ink-400 dark:text-ink-500"
                }`}
              />
              <span
                className={
                  isActive
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
