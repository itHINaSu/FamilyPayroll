import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { account, child, type AccountType, type ChildStatus } from "@/db/schema";

/** Age is always derived, never stored (spec 4.1). */
export function ageFromBirthdate(birthdate: string, on: Date = new Date()): number {
  const [y, m, d] = birthdate.split("-").map(Number);
  let age = on.getFullYear() - y;
  const beforeBirthday =
    on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d);
  if (beforeBirthday) age--;
  return age;
}

/**
 * The four accounts every child gets.
 *
 * `held` is where bills with a held_for_child disposition accumulate — the rent
 * fund. It is created up front so no later code path has to decide whether one
 * exists, and it is the only account with visibleToChild false (invariant I4).
 */
const ACCOUNT_TYPES: { type: AccountType; visibleToChild: boolean }[] = [
  { type: "checking", visibleToChild: true },
  { type: "savings", visibleToChild: true },
  { type: "generosity", visibleToChild: true },
  { type: "held", visibleToChild: false },
];

export function createChild(input: {
  householdId: string;
  displayName: string;
  birthdate: string;
  status: ChildStatus;
  photoBlobId?: string | null;
}) {
  return db.transaction((tx) => {
    const created = tx
      .insert(child)
      .values({
        householdId: input.householdId,
        displayName: input.displayName,
        birthdate: input.birthdate,
        status: input.status,
        photoBlobId: input.photoBlobId ?? null,
      })
      .returning({ id: child.id })
      .get();

    for (const spec of ACCOUNT_TYPES) {
      tx.insert(account)
        .values({
          childId: created.id,
          type: spec.type,
          visibleToChild: spec.visibleToChild,
        })
        .run();
    }

    return created.id;
  });
}

export type ChildOrder = "oldest_first" | "youngest_first" | "name";

/**
 * Ordering is a display preference, not a property of the data, so it is
 * applied here rather than baked into a column. Birth order is the default
 * because it is how families actually think about their children and it stays
 * stable as they grow; alphabetical is arbitrary and reshuffles when a name
 * changes.
 */
export function sortChildren<T extends { birthdate: string; displayName: string }>(
  rows: T[],
  order: ChildOrder = "oldest_first",
): T[] {
  return [...rows].sort((a, b) => {
    if (order === "name") return a.displayName.localeCompare(b.displayName);
    // An earlier birthdate means older, so ascending dates put the eldest first.
    const byAge = a.birthdate.localeCompare(b.birthdate);
    if (byAge !== 0) return order === "oldest_first" ? byAge : -byAge;
    return a.displayName.localeCompare(b.displayName); // twins
  });
}

export function listChildren(
  householdId: string,
  options: { includeArchived?: boolean; order?: ChildOrder } = {},
) {
  const scope = options.includeArchived
    ? eq(child.householdId, householdId)
    : and(eq(child.householdId, householdId), ne(child.status, "archived"));

  return sortChildren(db.select().from(child).where(scope).all(), options.order);
}

/**
 * Children to show on a money-oriented surface — the dashboard and the kiosk.
 *
 * `pre_participant` is a real state: a child can be in the family list, or just
 * recorded ahead of time, years before they earn anything. Four empty balances
 * next to a sibling's real ones is noise, so they are excluded unless a parent
 * asks for them.
 */
export function listEarningChildren(
  householdId: string,
  options: { showNotYetEarning?: boolean; order?: ChildOrder } = {},
) {
  const rows = listChildren(householdId, { order: options.order });
  return options.showNotYetEarning
    ? rows.filter((c) => c.status !== "archived")
    : rows.filter((c) => c.status === "active");
}

export function getChild(householdId: string, childId: string) {
  return (
    db
      .select()
      .from(child)
      .where(and(eq(child.householdId, householdId), eq(child.id, childId)))
      .get() ?? null
  );
}

export function getAccounts(childId: string) {
  return db.select().from(account).where(eq(account.childId, childId)).all();
}

/**
 * Child-facing account view. Invariant I4: the held account never crosses this
 * boundary. Every kiosk and child-role response must source balances here rather
 * than from getAccounts().
 */
export function getVisibleAccounts(childId: string) {
  return db
    .select()
    .from(account)
    .where(and(eq(account.childId, childId), eq(account.visibleToChild, true)))
    .all();
}

export const CHILD_STATUS_LABELS: Record<ChildStatus, string> = {
  pre_participant: "Not yet earning",
  active: "Active",
  graduated: "Graduated",
  archived: "Archived",
};
