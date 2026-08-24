"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shoppingItems } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { itemNameSchema, uuidSchema } from "@/lib/validation/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function revalidate() {
  revalidatePath("/shopping");
  revalidatePath("/");
}

/** Requester is always the session member — never taken from the browser. */
export async function addShoppingItem(name: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsed = itemNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That name isn't valid.");

  try {
    await db.insert(shoppingItems).values({
      name: parsed.data,
      requestedByMemberId: member.id,
    });
  } catch (error) {
    console.error("addShoppingItem failed", error);
    return fail(`Couldn't add ${parsed.data}. Try again.`);
  }

  revalidate();
  return { ok: true };
}

/** Any member may mark any open item picked up (spec §11.3). */
export async function setPickedUp(itemId: string, pickedUp: boolean): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsed = uuidSchema.safeParse(itemId);
  if (!parsed.success) return fail("That item isn't valid.");

  try {
    const updated = await db
      .update(shoppingItems)
      .set(
        pickedUp
          ? { pickedUpAt: new Date(), pickedUpByMemberId: member.id }
          : { pickedUpAt: null, pickedUpByMemberId: null },
      )
      .where(eq(shoppingItems.id, parsed.data))
      .returning({ id: shoppingItems.id });
    if (updated.length === 0) return fail("That item is gone.");
  } catch (error) {
    console.error("setPickedUp failed", error);
    return fail("Couldn't update that item. Try again.");
  }

  revalidate();
  return { ok: true };
}

/** Only the requester may delete — or an admin (spec §11.4). */
export async function deleteShoppingItem(itemId: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsed = uuidSchema.safeParse(itemId);
  if (!parsed.success) return fail("That item isn't valid.");

  const [item] = await db
    .select({ requestedByMemberId: shoppingItems.requestedByMemberId })
    .from(shoppingItems)
    .where(eq(shoppingItems.id, parsed.data))
    .limit(1);

  if (!item) return fail("That item is gone.");
  if (item.requestedByMemberId !== member.id && !member.isAdmin) {
    return fail("You can only delete items you added.");
  }

  try {
    await db.delete(shoppingItems).where(eq(shoppingItems.id, parsed.data));
  } catch (error) {
    console.error("deleteShoppingItem failed", error);
    return fail("Couldn't delete that. Try again.");
  }

  revalidate();
  return { ok: true };
}
