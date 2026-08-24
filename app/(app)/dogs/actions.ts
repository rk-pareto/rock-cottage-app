"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { petEvents } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { getEnabledPetBySlug, getEnabledPetForEvent } from "@/lib/dogs";
import { occurredAtSchema, petEventTypeSchema, petSlugSchema, uuidSchema } from "@/lib/validation/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/**
 * One tap = one event at the current time (spec §22). The dog and the event
 * type come from the button; the member and the timestamp come from the
 * server. Nothing about attribution is trusted from the browser.
 */
export async function recordPetEvent(slug: string, eventType: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsedSlug = petSlugSchema.safeParse(slug);
  const parsedType = petEventTypeSchema.safeParse(eventType);
  if (!parsedSlug.success || !parsedType.success) return fail("That action isn't valid.");

  // Feature-flag enforcement lives here, not only in the rendered markup.
  const pet = await getEnabledPetBySlug(parsedSlug.data);
  if (!pet) return fail("That dog isn't available.");

  try {
    await db.insert(petEvents).values({
      petId: pet.id,
      eventType: parsedType.data,
      occurredAt: new Date(),
      recordedByMemberId: member.id,
    });
  } catch (error) {
    console.error("recordPetEvent failed", error);
    return fail("Couldn't record that. Try again.");
  }

  revalidatePath("/dogs");
  revalidatePath("/");
  return { ok: true };
}

/** Correct a mistyped/mistimed event. Communal — any member may fix any event. */
export async function updatePetEventTime(eventId: string, occurredAt: string): Promise<ActionResult> {
  try {
    await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsedId = uuidSchema.safeParse(eventId);
  const parsedTime = occurredAtSchema.safeParse(occurredAt);
  if (!parsedId.success) return fail("That event isn't valid.");
  if (!parsedTime.success) return fail(parsedTime.error.issues[0]?.message ?? "Invalid time.");

  const pet = await getEnabledPetForEvent(parsedId.data);
  if (!pet) return fail("That event isn't available.");

  try {
    await db
      .update(petEvents)
      .set({ occurredAt: parsedTime.data, updatedAt: new Date() })
      .where(eq(petEvents.id, parsedId.data));
  } catch (error) {
    console.error("updatePetEventTime failed", error);
    return fail("Couldn't save that time. Try again.");
  }

  revalidatePath("/dogs");
  revalidatePath("/");
  return { ok: true };
}

export async function deletePetEvent(eventId: string): Promise<ActionResult> {
  try {
    await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsedId = uuidSchema.safeParse(eventId);
  if (!parsedId.success) return fail("That event isn't valid.");

  const pet = await getEnabledPetForEvent(parsedId.data);
  if (!pet) return fail("That event isn't available.");

  try {
    await db.delete(petEvents).where(eq(petEvents.id, parsedId.data));
  } catch (error) {
    console.error("deletePetEvent failed", error);
    return fail("Couldn't delete that. Try again.");
  }

  revalidatePath("/dogs");
  revalidatePath("/");
  return { ok: true };
}
