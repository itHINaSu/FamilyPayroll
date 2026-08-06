import { cookies } from "next/headers";

import { getHousehold } from "@/lib/auth/guard";
import { deviceForToken, kioskChildDetail, kioskRoster } from "@/lib/kiosk";
import { resolveHouseholdPolicy } from "@/lib/policy";
import { KioskShell } from "./kiosk-shell";
import { PairDevice } from "./pair-device";

export const dynamic = "force-dynamic";

/**
 * The always-on display.
 *
 * Authenticated by a long-lived device token in a cookie rather than a login,
 * because this runs unattended on a wall. It is read-mostly and never shows the
 * held account, bill dispositions, or trust on the shared roster.
 */
export default async function KioskPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; child?: string }>;
}) {
  const { token, child } = await searchParams;
  const store = await cookies();

  const activeToken = token ?? store.get("fp_kiosk")?.value;
  const device = activeToken ? deviceForToken(activeToken) : null;

  if (!device) return <PairDevice />;

  const home = getHousehold();
  const policy = resolveHouseholdPolicy(device.householdId);

  const roster = kioskRoster(device.householdId);
  const detail = child ? kioskChildDetail(device.householdId, child) : null;

  return (
    <KioskShell
      householdName={home?.name ?? "Family Payroll"}
      mode={device.dashboardMode ?? policy.kiosk.dashboardMode}
      roster={roster}
      detail={detail}
      token={token ?? null}
    />
  );
}
