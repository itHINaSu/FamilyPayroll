"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { logout } from "@/app/login/actions";
import { ChevronRightIcon, CloseIcon, GearIcon, MenuIcon, SignOutIcon } from "./icons";

/**
 * Everything configured occasionally rather than used daily — Setup and
 * Settings — plus the account itself, one tap away from a hamburger button
 * instead of sitting in the primary tab bar. Opens as a right-side panel
 * over the current screen rather than a full route change, so whatever tab
 * you were on is still there the moment you close it.
 */
export function AppMenu({
  displayName,
  username,
  householdName,
}: {
  displayName: string;
  username: string;
  householdName?: string;
}) {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition
          hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-700"
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-30" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />

          <div
            className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white shadow-xl
              dark:bg-ink-800"
          >
            <div className="flex items-center gap-3 bg-ledger-600 px-5 py-5 text-white">
              <button
                type="button"
                onClick={() => setOpen(false)}
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
              <MenuLink href="/config" onNavigate={() => setOpen(false)}>
                <SetupIcon />
                Setup
              </MenuLink>
              <MenuLink href="/settings" onNavigate={() => setOpen(false)}>
                <GearIcon className="h-5 w-5" />
                Settings
              </MenuLink>
            </nav>

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
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-ink-700 transition
        hover:bg-ink-50 dark:text-ink-100 dark:hover:bg-ink-700"
    >
      {children}
      <ChevronRightIcon className="ml-auto h-4 w-4 text-ink-300 dark:text-ink-500" />
    </Link>
  );
}
