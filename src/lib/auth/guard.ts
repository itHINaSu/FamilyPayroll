import "server-only";

import { redirect } from "next/navigation";

import { db } from "@/db";
import { household } from "@/db/schema";
import { getSessionUser, type SessionUser } from "./session";

/** True once the setup wizard has created a household and its first parent. */
export function isSetupComplete(): boolean {
  const row = db.select().from(household).get();
  return !!row?.setupCompletedAt;
}

export function getHousehold() {
  return db.select().from(household).get() ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  if (!isSetupComplete()) redirect("/setup");

  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");
  return sessionUser;
}

/**
 * Parent-only actions. Every mutation in the management UI goes through this;
 * the child role exists in the schema from day one but is not yet issued, and
 * must never reach a management route by accident when it is.
 */
export async function requireParent(): Promise<SessionUser> {
  const sessionUser = await requireUser();
  if (sessionUser.role !== "parent") redirect("/");
  return sessionUser;
}
