"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { media, memoryFavorites } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { deleteObjects } from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** A member may delete their own memory; an admin may delete any (spec §20). */
export async function deleteMemory(memoryId: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  const parsed = uuidSchema.safeParse(memoryId);
  if (!parsed.success) return { ok: false, error: "That memory isn't valid." };

  const [item] = await db.select().from(media).where(eq(media.id, parsed.data)).limit(1);
  if (!item) return { ok: false, error: "That memory is already gone." };
  if (item.uploadedByMemberId !== member.id && !member.isAdmin) {
    return { ok: false, error: "You can only delete memories you added." };
  }

  try {
    // Remove the row first: an orphaned object is a smaller problem than a
    // gallery entry whose bytes have vanished.
    await db.delete(media).where(eq(media.id, item.id));
  } catch (error) {
    console.error("deleteMemory failed", error);
    return { ok: false, error: "Couldn't delete that memory. Try again." };
  }

  // The memory is gone from the user's point of view. Bucket cleanup is
  // best-effort — a failure here must not report the delete as failed.
  try {
    await deleteObjects(
      [item.originalKey, item.displayKey, item.thumbnailKey, item.posterKey].filter(
        (k): k is string => Boolean(k),
      ),
    );
  } catch (error) {
    console.error("deleteMemory: object cleanup failed", item.id, error);
  }

  revalidatePath("/memories");
  revalidatePath("/");
  return { ok: true };
}

export type FavoriteResult = ActionResult & { favorited?: boolean };

/**
 * Toggle whether the current member has favorited a memory. Scoped entirely
 * to `member.id` — no one else's favorites are ever read or written here
 * (spec: favorites are private to each member).
 */
export async function toggleFavorite(memoryId: string): Promise<FavoriteResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  const parsed = uuidSchema.safeParse(memoryId);
  if (!parsed.success) return { ok: false, error: "That memory isn't valid." };

  const match = and(
    eq(memoryFavorites.memberId, member.id),
    eq(memoryFavorites.memoryId, parsed.data),
  );

  try {
    const [existing] = await db.select().from(memoryFavorites).where(match).limit(1);
    if (existing) {
      await db.delete(memoryFavorites).where(match);
      revalidatePath("/memories");
      return { ok: true, favorited: false };
    }

    await db
      .insert(memoryFavorites)
      .values({ memberId: member.id, memoryId: parsed.data })
      .onConflictDoNothing();
    revalidatePath("/memories");
    return { ok: true, favorited: true };
  } catch (error) {
    console.error("toggleFavorite failed", error);
    return { ok: false, error: "Couldn't update your favorites. Try again." };
  }
}

