import { ChecklistIcon, GearIcon, HomeIcon, ShieldIcon, WalletIcon } from "./icons";

export const TABS = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  // "Chores" here, "Responsibilities" everywhere else in the app — the full
  // word doesn't fit five-across on a phone without crowding its neighbors.
  { href: "/responsibilities", label: "Chores", icon: ChecklistIcon },
  { href: "/expectations", label: "Trust", icon: ShieldIcon },
  { href: "/children", label: "Balances", icon: WalletIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
] as const;

/**
 * Which tab a given path belongs to, checked in priority order rather than
 * each tab testing independently — a per-child page can plausibly match more
 * than one tab's prefix (e.g. /children/[id]/responsibilities is under both
 * "/children" and "responsibilities" — only the latter should light up).
 */
export function activeTab(pathname: string): string | null {
  if (pathname === "/") return "/";
  if (pathname.includes("/responsibilities")) return "/responsibilities";
  if (pathname.startsWith("/expectations") || pathname.includes("/trust")) return "/expectations";
  if (pathname.startsWith("/settings")) return "/settings";
  if (pathname.startsWith("/children")) return "/children";
  return null;
}
