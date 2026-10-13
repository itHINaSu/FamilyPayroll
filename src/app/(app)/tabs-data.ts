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
 * Which tab a given path belongs to. A child's own pages light up the tab
 * they expand on: their expectations page under Expectations, the rest under
 * Balances. Setup pages light up nothing — they're reached through the menu.
 */
export function activeTab(pathname: string): string | null {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/expectations")) return "/expectations";
  if (pathname.startsWith("/children/") && pathname.includes("/responsibilities")) {
    return "/expectations";
  }
  if (pathname.startsWith("/settings")) return "/settings";
  if (pathname.startsWith("/balances") || pathname.startsWith("/children/")) return "/balances";
  return null;
}
