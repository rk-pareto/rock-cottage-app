"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bringingItems } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { categorySchema, itemNameSchema, optionalTextSchema, uuidSchema } from "@/lib/validation/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Ownership is always the session member (spec §12.1). */
export async function addBringingItem(input: {
  name: string;
  category?: string;
  notes?: string;
}): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const name = itemNameSchema.safeParse(input.name);
  const category = categorySchema.safeParse(input.category ?? "");
  const notes = optionalTextSchema.safeParse(input.notes ?? "");
  if (!name.success) return fail(name.error.issues[0]?.message ?? "That name isn't valid.");
  if (!category.success || !notes.success) return fail("That entry isn't valid.");

  try {
    await db.insert(bringingItems).values({
      name: name.data,
      category: category.data,
      notes: notes.data,
      responsibleMemberId: member.id,
    });
  } catch (error) {
    console.error("addBringingItem failed", error);
    return fail(`Couldn't add ${name.data}. Try again.`);
  }

  revalidatePath("/bringing");
  return { ok: true };
}

type OwnedItem = { id: string; error?: undefined } | { id?: undefined; error: string };

/** Load an item and confirm the caller owns it (or is admin). */
async function requireOwnedItem(itemId: string): Promise<OwnedItem> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { error: "You're signed out. Sign in and try again." };
  }

  const parsed = uuidSchema.safeParse(itemId);
  if (!parsed.success) return { error: "That item isn't valid." };

  const [item] = await db
    .select({ id: bringingItems.id, responsibleMemberId: bringingItems.responsibleMemberId })
    .from(bringingItems)
    .where(eq(bringingItems.id, parsed.data))
    .limit(1);

  if (!item) return { error: "That item is gone." };
  if (item.responsibleMemberId !== member.id && !member.isAdmin) {
    return { error: "That's someone else's item." };
  }
  return { id: item.id };
}

export async function updateBringingItem(
  itemId: string,
  input: { name: string; category?: string; notes?: string },
): Promise<ActionResult> {
  const owned = await requireOwnedItem(itemId);
  if (owned.error !== undefined) return fail(owned.error);

  const name = itemNameSchema.safeParse(input.name);
  const category = categorySchema.safeParse(input.category ?? "");
  const notes = optionalTextSchema.safeParse(input.notes ?? "");
  if (!name.success) return fail(name.error.issues[0]?.message ?? "That name isn't valid.");
  if (!category.success || !notes.success) return fail("That entry isn't valid.");

  try {
    await db
      .update(bringingItems)
      .set({
        name: name.data,
        category: category.data,
        notes: notes.data,
        updatedAt: new Date(),
      })
      .where(eq(bringingItems.id, owned.id));
  } catch (error) {
    console.error("updateBringingItem failed", error);
    return fail("Couldn't save that. Try again.");
  }

  revalidatePath("/bringing");
  return { ok: true };
}

export async function setPacked(itemId: string, packed: boolean): Promise<ActionResult> {
  const owned = await requireOwnedItem(itemId);
  if (owned.error !== undefined) return fail(owned.error);

  try {
    await db
      .update(bringingItems)
      .set({ packedAt: packed ? new Date() : null, updatedAt: new Date() })
      .where(eq(bringingItems.id, owned.id));
  } catch (error) {
    console.error("setPacked failed", error);
    return fail("Couldn't update that. Try again.");
  }

  revalidatePath("/bringing");
  return { ok: true };
}

export async function deleteBringingItem(itemId: string): Promise<ActionResult> {
  const owned = await requireOwnedItem(itemId);
  if (owned.error !== undefined) return fail(owned.error);

  try {
    await db.delete(bringingItems).where(eq(bringingItems.id, owned.id));
  } catch (error) {
    console.error("deleteBringingItem failed", error);
    return fail("Couldn't delete that. Try again.");
  }

  revalidatePath("/bringing");
  return { ok: true };
}
