"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { job } from "@/db/schema";
import { requireParent } from "@/lib/auth/guard";
import { decideJobClaim } from "@/lib/jobs";
import { parseAmountToCents } from "@/lib/money";

export type JobState = { error?: string; ok?: boolean };

const JobSchema = z.object({
  name: z.string().trim().min(1, "Name the job."),
  description: z.string().trim().optional(),
  value: z.string().min(1, "Enter what it pays."),
  repeatRule: z.enum(["once", "weekly", "monthly", "every_n_days"]),
  repeatN: z.string().optional(),
  limitScope: z.enum(["per_child", "global"]),
  limitCount: z.string().optional(),
  claimExpiryHours: z.string().optional(),
  allocationMode: z.enum(["inherit", "checking_only"]),
  trustAreaId: z.string().optional(),
  minTrustLevel: z.string().optional(),
});

export async function addJob(_prev: JobState, formData: FormData): Promise<JobState> {
  const parent = await requireParent();

  const parsed = JobSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    value: formData.get("value"),
    repeatRule: formData.get("repeatRule"),
    repeatN: formData.get("repeatN") ?? undefined,
    limitScope: formData.get("limitScope"),
    limitCount: formData.get("limitCount") ?? undefined,
    claimExpiryHours: formData.get("claimExpiryHours") ?? undefined,
    allocationMode: formData.get("allocationMode"),
    trustAreaId: formData.get("trustAreaId") ?? undefined,
    minTrustLevel: formData.get("minTrustLevel") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const valueCents = parseAmountToCents(parsed.data.value);
  if (valueCents === null || valueCents <= 0) {
    return { error: "Enter a positive amount." };
  }

  const eligible = formData.getAll("eligibleChildIds").map(String);

  db.insert(job)
    .values({
      householdId: parent.householdId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      valueCents,
      eligibleChildIds: eligible.length ? eligible : null,
      repeatRule: parsed.data.repeatRule,
      repeatN:
        parsed.data.repeatRule === "every_n_days"
          ? Math.max(1, Number(parsed.data.repeatN ?? 1))
          : null,
      limitScope: parsed.data.limitScope,
      limitCount: Math.max(1, Number(parsed.data.limitCount ?? 1)),
      claimExpiryHours: Math.max(1, Number(parsed.data.claimExpiryHours ?? 48)),
      allocationMode: parsed.data.allocationMode,
      // Invariant I10: a trust gate blocks CLAIMING, never pay for work done.
      trustAreaId: parsed.data.trustAreaId || null,
      minTrustLevel: parsed.data.trustAreaId
        ? Number(parsed.data.minTrustLevel ?? 3)
        : null,
    })
    .run();

  revalidatePath("/jobs");
  return { ok: true };
}

export async function archiveJob(formData: FormData): Promise<void> {
  await requireParent();
  db.update(job)
    .set({ active: false })
    .where(eq(job.id, String(formData.get("jobId") ?? "")))
    .run();
  revalidatePath("/jobs");
}

export async function decideClaim(formData: FormData): Promise<void> {
  const parent = await requireParent();
  decideJobClaim(
    String(formData.get("claimId") ?? ""),
    String(formData.get("decision")) === "approve",
    parent.id,
  );
  revalidatePath("/jobs");
}
