import { ChecklistIcon, GearIcon, HomeIcon, ShieldIcon, WalletIcon } from "./icons";

export const TABS = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  // /chores and /trust are the accounting side (pick a child, log
  // something) — the family-level template pages these are named after
  // (/responsibilities, /expectations) are Setup, not a tab.
  { href: "/chores", label: "Chores", icon: ChecklistIcon },
  { href: "/trust", label: "Trust", icon: ShieldIcon },
  { href: "/balances", label: "Balances", icon: WalletIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
] as const;

/**
 * Which tab a given path belongs to, checked in priority order rather than
 * each tab testing independently — a per-child page can plausibly match
 * more than one tab's prefix (e.g. /children/[id]/responsibilities is under
 * both Balances and Chores conceptually — only the latter should light
 * up). Setup's own pages (/children, /responsibilities, /expectations,
 * /jobs, /bills, /config) intentionally light up nothing — they're reached
 * through the hamburger, not this bar.
 */
export function activeTab(pathname: string): string | null {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/chores")) return "/chores";
  if (pathname.startsWith("/trust")) return "/trust";
  if (pathname.startsWith("/children/") && pathname.includes("/responsibilities")) return "/chores";
  if (pathname.startsWith("/children/") && pathname.includes("/trust")) return "/trust";
  if (pathname.startsWith("/settings")) return "/settings";
  if (pathname.startsWith("/balances") || pathname.startsWith("/children/")) return "/balances";
  return null;
}
