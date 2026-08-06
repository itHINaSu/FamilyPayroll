"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { household, user } from "@/db/schema";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isSetupComplete } from "@/lib/auth/guard";
import { config } from "@/lib/config";
import { seedHousehold } from "@/lib/seed";

const SetupSchema = z.object({
  householdName: z.string().trim().min(1, "Give your household a name."),
  timezone: z.string().trim().min(1),
  displayName: z.string().trim().min(1, "Enter your name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string(),
});

export type SetupState = { error?: string };

/**
 * First-run wizard.
 *
 * Deliberately the only way a household is created: no seeding from environment
 * variables, no default credentials baked into the image. `docker compose up -d`
 * brings up an app that is safe to expose before anyone has configured it,
 * because until this action runs there is nothing to log into.
 */
export async function completeSetup(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (isSetupComplete()) {
    return { error: "Setup has already been completed." };
  }

  const parsed = SetupSchema.safeParse({
    householdName: formData.get("householdName"),
    timezone: formData.get("timezone"),
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const passwordError = validatePassword(parsed.data.password);
  if (passwordError) return { error: passwordError };

  const passwordHash = await hashPassword(parsed.data.password);

  const createdUserId = db.transaction((tx) => {
    const createdHousehold = tx
      .insert(household)
      .values({
        name: parsed.data.householdName,
        timezone: parsed.data.timezone,
        appUrl: config.appUrl,
        setupCompletedAt: Date.now(),
      })
      .returning({ id: household.id })
      .get();

    const createdUser = tx
      .insert(user)
      .values({
        householdId: createdHousehold.id,
        email: parsed.data.email,
        passwordHash,
        displayName: parsed.data.displayName,
        role: "parent",
      })
      .returning({ id: user.id })
      .get();

    return { userId: createdUser.id, householdId: createdHousehold.id };
  });

  // Starter trust areas, house rules, and privileges, so nobody meets a blank
  // configuration screen. All of it is editable afterwards.
  seedHousehold(createdUserId.householdId);

  await createSession(createdUserId.userId);
  redirect("/");
}
