import "server-only";

import { getBalances } from "@/lib/ledger";
import { resolvePolicy } from "@/lib/policy";
import type { MoneyKid } from "./money-form";

/** Everything the transaction form needs about one child. */
export function moneyKid(
  householdId: string,
  c: { id: string; displayName: string },
): MoneyKid {
  const b = getBalances(c.id);
  const policy = resolvePolicy(householdId, c.id);
  return {
    id: c.id,
    name: c.displayName,
    balances: { checking: b.checking, savings: b.savings, generosity: b.generosity, held: b.held },
    paySplit: {
      checking: policy.allocation.checkingPct,
      savings: policy.allocation.savingsPct,
      generosity: policy.allocation.generosityPct,
    },
    roundingBucket: policy.allocation.roundingBucket,
  };
}
