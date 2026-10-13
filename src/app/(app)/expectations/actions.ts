"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { completion } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { getChild } from "@/lib/children";
import { resolvePolicy } from "@/lib/policy";
import { toggleBox } from "@/lib/responsibilities";

/**
 * A tap on one box of the week view. Returns the id of a miss it just
 * recorded so the caller can offer to attach a note.
 */
export async function tapBox(input: {
  childId: string;
  responsibilityId: string;
  date: string;
  weekEnd?: string;
  checked: boolean;
}): Promise<{ missId: string | null }> {
  const parent = await requireParent();
  if (!getChild(parent.householdId, input.childId)) return { missId: null };

  const result = toggleBox({
    ...input,
    parentId: parent.id,
    completionMode: resolvePolicy(parent.householdId, input.childId).completion.mode,
  });

  revalidatePath("/", "layout");
  return result;
}

/** Attach (or clear) the note on a miss. */
export async function saveMissNote(input: {
  childId: string;
  missId: string;
  note: string;
}): Promise<void> {
  const parent = await requireParent();
  if (!getChild(parent.householdId, input.childId)) return;

  const note = input.note.trim().slice(0, 500);
  db.update(completion)
    .set({ note: note || null })
    .where(
      and(
        eq(completion.id, input.missId),
        eq(completion.childId, input.childId),
        eq(completion.status, "missed"),
      ),
    )
    .run();

  revalidatePath("/expectations", "layout");
}

