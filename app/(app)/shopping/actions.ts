"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { shoppingItems } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { canEditShoppingItem, getShoppingItemById } from "@/lib/shopping";
import { deleteObjects, shoppingUploadKey } from "@/lib/storage/s3";
import { itemNameSchema, uuidSchema } from "@/lib/validation/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Adding gives the id back, because a photo is attached to the item straight
 *  afterwards and the browser has to know what it just created. */
export type AddResult = { ok: true; itemId: string } | { ok: false; error: string };

/** Typed as the failure arm alone, so it satisfies every result shape here. */
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function revalidate() {
  revalidatePath("/shopping");
  revalidatePath("/");
}

/** Requester is always the session member — never taken from the browser. */
export async function addShoppingItem(name: string): Promise<AddResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsed = itemNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That name isn't valid.");

  let itemId: string;
  try {
    const [row] = await db
      .insert(shoppingItems)
      .values({
        name: parsed.data,
        requestedByMemberId: member.id,
      })
      .returning({ id: shoppingItems.id });
    if (!row) return fail(`Couldn't add ${parsed.data}. Try again.`);
    itemId = row.id;
  } catch (error) {
    console.error("addShoppingItem failed", error);
    return fail(`Couldn't add ${parsed.data}. Try again.`);
  }

  revalidate();
  return { ok: true, itemId };
}

/**
 * Take the photo back off an item, leaving the item itself alone. Same
 * ownership rule as deleting it — see {@link canEditShoppingItem}.
 */
export async function removeShoppingPhoto(itemId: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsed = uuidSchema.safeParse(itemId);
  if (!parsed.success) return fail("That item isn't valid.");

  const item = await getShoppingItemById(parsed.data);
  if (!item) return fail("That item is gone.");
  if (!canEditShoppingItem(item, member)) {
    return fail("You can only change photos on items you added.");
  }
  if (!item.photoKey) return { ok: true };

  try {
    await db
      .update(shoppingItems)
      .set({ photoKey: null })
      .where(eq(shoppingItems.id, item.id));
  } catch (error) {
    console.error("removeShoppingPhoto failed", error);
    return fail("Couldn't remove that photo. Try again.");
  }

  await cleanUpPhoto(item.id, item.photoKey);
  revalidate();
  return { ok: true };
}

/**
 * Best-effort bucket tidying, always after the row has been written: an
 * orphaned object is a smaller problem than a list entry whose photo has
 * vanished, and a failure here must never be reported as a failed action.
 *
 * An item that never had a photo has nothing to chase, and most of them
 * haven't — so that case costs no bucket round trip at all.
 */
async function cleanUpPhoto(itemId: string, photoKey: string | null) {
  if (!photoKey) return;
  try {
    // The scratch upload goes too: if a phone died between PUT and processing,
    // this is the only thing that would ever come back for it.
    await deleteObjects([photoKey, shoppingUploadKey(itemId)]);
  } catch (error) {
    console.error("shopping photo cleanup failed", itemId, error);
  }
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

/**
 * Batch pickup confirmation — the "Got it" button. Marks every selected open
 * item picked up by the session member in one stroke, all sharing the same
 * timestamp so Home can group them into a single activity tile.
 */
export async function confirmPickedUp(itemIds: string[]): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsed = z.array(uuidSchema).min(1).safeParse(itemIds);
  if (!parsed.success) return fail("Nothing was selected.");

  try {
    const updated = await db
      .update(shoppingItems)
      .set({ pickedUpAt: new Date(), pickedUpByMemberId: member.id })
      .where(and(inArray(shoppingItems.id, parsed.data), isNull(shoppingItems.pickedUpAt)))
      .returning({ id: shoppingItems.id });
    if (updated.length === 0) return fail("Those items are gone.");
  } catch (error) {
    console.error("confirmPickedUp failed", error);
    return fail("Couldn't update those items. Try again.");
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

  const item = await getShoppingItemById(parsed.data);
  if (!item) return fail("That item is gone.");
  if (!canEditShoppingItem(item, member)) {
    return fail("You can only delete items you added.");
  }

  try {
    await db.delete(shoppingItems).where(eq(shoppingItems.id, parsed.data));
  } catch (error) {
    console.error("deleteShoppingItem failed", error);
    return fail("Couldn't delete that. Try again.");
  }

  await cleanUpPhoto(item.id, item.photoKey);
  revalidate();
  return { ok: true };
}
