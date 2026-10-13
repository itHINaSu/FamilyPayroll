import { ChecklistIcon, GearIcon, HomeIcon, WalletIcon } from "./icons";

export const TABS = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  // The day-to-day side. Defining expectations and what they pay lives in
  // Setup (/responsibilities), reached through the menu, not a tab.
  { href: "/expectations", label: "Expectations", icon: ChecklistIcon },
  { href: "/balances", label: "Balances", icon: WalletIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
] as const;

/**
 * Which tab a given path belongs to. A child's expectations page lights up
 * Expectations; their account, goals and pay stubs light up Balances. Setup
 * pages (including a child's profile under /children) light up nothing —
 * they're reached through the menu.
 */
export function activeTab(pathname: string): string | null {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/expectations")) return "/expectations";
  if (pathname.startsWith("/balances")) return "/balances";
  if (pathname.startsWith("/settings")) return "/settings";
  return null;
}
