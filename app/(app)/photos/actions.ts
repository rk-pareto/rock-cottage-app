"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { deleteObjects } from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** A member may delete their own photo; an admin may delete any (spec §20). */
export async function deletePhoto(photoId: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  const parsed = uuidSchema.safeParse(photoId);
  if (!parsed.success) return { ok: false, error: "That photo isn't valid." };

  const [photo] = await db.select().from(photos).where(eq(photos.id, parsed.data)).limit(1);
  if (!photo) return { ok: false, error: "That photo is already gone." };
  if (photo.uploadedByMemberId !== member.id && !member.isAdmin) {
    return { ok: false, error: "You can only delete photos you uploaded." };
  }

  try {
    // Remove the row first: an orphaned object is a smaller problem than a
    // gallery entry whose bytes have vanished.
    await db.delete(photos).where(eq(photos.id, photo.id));
    await deleteObjects(
      [photo.originalKey, photo.displayKey, photo.thumbnailKey].filter(
        (k): k is string => Boolean(k),
      ),
    );
  } catch (error) {
    console.error("deletePhoto failed", error);
    return { ok: false, error: "Couldn't delete that photo. Try again." };
  }

  revalidatePath("/photos");
  revalidatePath("/");
  return { ok: true };
}
