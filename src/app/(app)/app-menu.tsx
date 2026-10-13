"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { logout } from "@/app/login/actions";
import {
  BriefcaseIcon,
  ChecklistIcon,
  ChevronRightIcon,
  CloseIcon,
  MenuIcon,
  ReceiptIcon,
  SignOutIcon,
  UserIcon,
} from "./icons";
import { ThemeToggle } from "./theme-toggle";

const SETUP_LINKS = [
  { href: "/children", label: "Children", icon: UserIcon },
  { href: "/responsibilities", label: "Expectations", icon: ChecklistIcon },
  { href: "/jobs", label: "Extra jobs", icon: BriefcaseIcon },
  { href: "/bills", label: "Bills", icon: ReceiptIcon },
];

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
  // Expanded by default every time the menu opens — collapsing it is a
  // this-glance preference, not something worth remembering turn to turn.
  const [setupOpen, setSetupOpen] = useState(true);

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
        onClick={() => {
          setOpen(true);
          setSetupOpen(true);
        }}
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

      {open && (
        <div className="fixed inset-0 z-30" role="dialog" aria-modal="true">
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
            <div className="flex items-center gap-3 bg-ledger-600 px-5 py-5 text-white">
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
              <MenuLink href="/settings#account" onNavigate={close}>
                <UserIcon className="h-5 w-5" />
                Account
              </MenuLink>

              <button
                type="button"
                onClick={() => setSetupOpen((v) => !v)}
                aria-expanded={setupOpen}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-medium text-ink-700
                  transition hover:bg-ink-50 dark:text-ink-100 dark:hover:bg-ink-700"
              >
                <SetupIcon />
                Setup
                {pendingJobs > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                    {pendingJobs} waiting
                  </span>
                )}
                <ChevronRightIcon
                  className={`ml-auto h-4 w-4 text-ink-300 transition-transform dark:text-ink-500 ${
                    setupOpen ? "rotate-90" : ""
                  }`}
                />
              </button>

              {setupOpen && (
                <div className="bg-ink-50 dark:bg-ink-900/40">
                  {SETUP_LINKS.map((link) => (
                    <MenuLink key={link.href} href={link.href} onNavigate={close} indent>
                      <link.icon className="h-5 w-5" />
                      {link.label}
                      {link.href === "/jobs" && pendingJobs > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                          {pendingJobs}
                        </span>
                      )}
                    </MenuLink>
                  ))}
                </div>
              )}
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
        </div>
      )}
    </>
  );
}

function SetupIcon() {
  // A small wrench-and-list glyph would be its own icon for a single use —
  // the gear from Settings already reads as "configuration", so Setup gets
  // the same mark rotated visually distinct via its own list-like sibling
  // instead of adding a lookalike icon just for this one row.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
  indent = false,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
  /** Setup's sub-links sit visually inside the disclosure they belong to. */
  indent?: boolean;
}) {
  // No trailing chevron here — that reads as "this expands," which is only
  // true of the Setup row's own toggle button. A plain link just navigates.
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 py-3 text-sm font-medium text-ink-700 transition
        hover:bg-ink-100/60 dark:text-ink-100 dark:hover:bg-ink-700 ${
          indent ? "pl-9 pr-5" : "px-5 py-3.5"
        }`}
    >
      {children}
    </Link>
  );
}
