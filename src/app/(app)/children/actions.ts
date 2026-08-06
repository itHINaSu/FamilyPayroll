"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { auditLog, child } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { createChild, getChild } from "@/lib/children";
import { storeImage, ACCEPTED_UPLOAD_TYPES } from "@/lib/images";

const ChildSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name."),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a birthdate.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "That date is not valid.")
    .refine((v) => Date.parse(v) <= Date.now(), "Birthdate cannot be in the future."),
  status: z.enum(["pre_participant", "active", "graduated", "archived"]),
});

export type ChildFormState = { error?: string; ok?: boolean };

async function readPhoto(
  householdId: string,
  formData: FormData,
): Promise<string | null> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;

  if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
    throw new Error("That file type is not a supported image.");
  }

  // No size ceiling on the upload itself; storeImage downscales whatever arrives.
  const buffer = Buffer.from(await file.arrayBuffer());
  return storeImage(householdId, buffer, "avatar");
}

export async function addChild(
  _prev: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  const parent = await requireParent();

  const parsed = ChildSchema.safeParse({
    displayName: formData.get("displayName"),
    birthdate: formData.get("birthdate"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  let photoBlobId: string | null = null;
  try {
    photoBlobId = await readPhoto(parent.householdId, formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed." };
  }

  const childId = createChild({
    householdId: parent.householdId,
    displayName: parsed.data.displayName,
    birthdate: parsed.data.birthdate,
    status: parsed.data.status,
    photoBlobId,
  });

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "child.created",
      entityType: "child",
      entityId: childId,
      afterJson: parsed.data,
    })
    .run();

  revalidatePath("/children");
  return { ok: true };
}

export async function updateChild(
  _prev: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");

  const existing = getChild(parent.householdId, childId);
  if (!existing) return { error: "That child could not be found." };

  const parsed = ChildSchema.safeParse({
    displayName: formData.get("displayName"),
    birthdate: formData.get("birthdate"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  let photoBlobId = existing.photoBlobId;
  try {
    photoBlobId = (await readPhoto(parent.householdId, formData)) ?? photoBlobId;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed." };
  }

  db.update(child)
    .set({
      displayName: parsed.data.displayName,
      birthdate: parsed.data.birthdate,
      status: parsed.data.status,
      photoBlobId,
      graduatedAt:
        parsed.data.status === "graduated" && !existing.graduatedAt
          ? Date.now()
          : existing.graduatedAt,
    })
    .where(eq(child.id, childId))
    .run();

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "child.updated",
      entityType: "child",
      entityId: childId,
      beforeJson: {
        displayName: existing.displayName,
        birthdate: existing.birthdate,
        status: existing.status,
      },
      afterJson: parsed.data,
    })
    .run();

  revalidatePath("/children");
  revalidatePath(`/children/${childId}`);
  return { ok: true };
}

/**
 * Invariant I7: archive, never delete. A child's ledger has to outlive their
 * participation — the whole point is handing them a complete history later.
 */
export async function archiveChild(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");

  const existing = getChild(parent.householdId, childId);
  if (!existing) return;

  db.update(child).set({ status: "archived" }).where(eq(child.id, childId)).run();

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "child.archived",
      entityType: "child",
      entityId: childId,
      beforeJson: { status: existing.status },
      afterJson: { status: "archived" },
    })
    .run();

  revalidatePath("/children");
}

export async function restoreChild(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");

  if (!getChild(parent.householdId, childId)) return;

  db.update(child).set({ status: "active" }).where(eq(child.id, childId)).run();

  db.insert(auditLog)
    .values({
      actorUserId: parent.id,
      action: "child.restored",
      entityType: "child",
      entityId: childId,
      afterJson: { status: "active" },
    })
    .run();

  revalidatePath("/children");
}
