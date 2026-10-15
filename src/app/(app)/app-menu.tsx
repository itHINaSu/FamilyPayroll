"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { logout } from "@/app/login/actions";
import {
  ArchiveIcon,
  BanknoteIcon,
  BellIcon,
  BriefcaseIcon,
  ChecklistIcon,
  ChevronRightIcon,
  CloseIcon,
  HomeIcon,
  MenuIcon,
  MonitorIcon,
  ReceiptIcon,
  SignOutIcon,
  UserIcon,
} from "./icons";
import { ThemeToggle } from "./theme-toggle";

/** Settings, grouped the same way as the Settings page. */
const SETTINGS_GROUPS = [
  { label: null, links: [{ href: "/settings/account", label: "Account", icon: UserIcon }] },
  { label: "Family", links: [{ href: "/settings/family", label: "Household", icon: HomeIcon }] },
  {
    label: "Pay",
    links: [
      { href: "/settings/payroll", label: "Payroll", icon: BanknoteIcon },
      { href: "/settings/expectations", label: "Expectations", icon: ChecklistIcon },
      { href: "/settings/jobs", label: "Extra jobs", icon: BriefcaseIcon },
      { href: "/settings/bills", label: "Bills", icon: ReceiptIcon },
    ],
  },
  {
    label: "App",
    links: [
      { href: "/settings/display", label: "Display and kiosk", icon: MonitorIcon },
      { href: "/settings/notifications", label: "Notifications", icon: BellIcon },
    ],
  },
  { label: "Data", links: [{ href: "/settings/data", label: "Backups and data", icon: ArchiveIcon }] },
];

const OPEN_EVENT = "app-menu:open";

/** Opens the side menu from anywhere (the phone's Settings tab uses this). */
export function openAppMenu() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Everything configured occasionally rather than used daily — reached one
 * tap from a hamburger button instead of sitting in the primary tab bar.
 * Opens as a right-side panel over the current screen rather than a full
 * route change, so whatever tab you were on is still there the moment you
 * close it.
 */
export function AppMenu({
  displayName,
  username,
  householdName,
  pendingJobs = 0,
}: {
  displayName: string;
  username: string;
  householdName?: string;
  /** Extra-job claims waiting on approval — buried under Setup now that
   * Jobs isn't a bottom tab, so a badge here is the only hint left. */
  pendingJobs?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The phone's Settings tab opens this menu rather than a page (and the
  // installed app has no header to hold the hamburger), so it listens for
  // a window event any component can fire via openAppMenu().
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    // A background scroll behind an open overlay panel is disorienting on a
    // phone, so lock it while the menu is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const initial = displayName.charAt(0).toUpperCase() || "?";
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open menu"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-600
          transition hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-700"
      >
        <MenuIcon className="h-6 w-6" />
        {pendingJobs > 0 && (
          <span
            aria-label={`${pendingJobs} waiting on you`}
            className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center
              rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
          >
            {pendingJobs > 9 ? "9+" : pendingJobs}
          </span>
        )}
      </button>

      {open &&
        createPortal(
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="absolute inset-0 bg-black/30"
          />

          <div
            className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white shadow-xl
              dark:bg-ink-800"
          >
            <div className="menu-head flex items-center gap-3 bg-ledger-600 px-5 py-5 text-white">
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-semibold">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{displayName}</p>
                <p className="truncate text-sm text-white/80">
                  {username}
                  {householdName ? ` · ${householdName}` : ""}
                </p>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {SETTINGS_GROUPS.map((group, i) => (
                <div key={group.label ?? i}>
                  {group.label && (
                    <p className="px-5 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                      {group.label}
                    </p>
                  )}
                  {group.links.map((link) => (
                    <MenuLink
                      key={link.href}
                      href={link.href}
                      onNavigate={close}
                      active={pathname.startsWith(link.href)}
                    >
                      <link.icon className="h-5 w-5" />
                      {link.label}
                      {link.href === "/settings/jobs" && pendingJobs > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                          {pendingJobs} waiting
                        </span>
                      )}
                    </MenuLink>
                  ))}
                </div>
              ))}
            </nav>

            <div className="border-t border-ink-100 dark:border-ink-700">
              <ThemeToggle />
            </div>

            <div className="border-t border-ink-100 p-2 dark:border-ink-700">
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium
                    text-ink-600 transition hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-700"
                >
                  <SignOutIcon className="h-5 w-5" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
  active = false,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 py-3 text-sm font-medium transition
        hover:bg-ink-100/60 dark:hover:bg-ink-700 ${
          active ? "text-ledger-600 dark:text-ledger-500" : "text-ink-700 dark:text-ink-100"
        } px-5`}
    >
      {children}
    </Link>
  );
}
