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

export function listChildren(householdId: string, includeArchived = false) {
  const scope = includeArchived
    ? eq(child.householdId, householdId)
    : and(eq(child.householdId, householdId), ne(child.status, "archived"));

  return db.select().from(child).where(scope).orderBy(child.sortOrder, child.displayName).all();
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
