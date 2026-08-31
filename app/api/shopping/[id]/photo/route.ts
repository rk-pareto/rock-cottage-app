import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shoppingItems } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { canEditShoppingItem, getShoppingItemById } from "@/lib/shopping";
import { compressPhoto } from "@/lib/storage/process";
import {
  deleteObjects,
  getObjectBytes,
  putObjectBytes,
  shoppingPhotoKey,
  shoppingUploadKey,
} from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
// Full-resolution HEIC decoding is slow; give it the same room as a memory.
export const maxDuration = 120;

/**
 * Step 2: the phone has finished PUTting its photo, so read it back, squash it
 * to one modest WebP and point the item at that.
 *
 * This is where a shopping photo parts company with a memory. A memory keeps
 * its original forever and the derivatives are conveniences; here the
 * compressed copy *is* the photo, so the upload is deleted the moment it has
 * been re-encoded — success or failure, the raw bytes never linger.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/shopping/[id]/photo">) {
  let member;
  try {
    member = await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Unknown item" }, { status: 400 });

  const item = await getShoppingItemById(parsedId.data);
  if (!item) return NextResponse.json({ error: "That item is gone." }, { status: 404 });
  if (!canEditShoppingItem(item, member)) {
    return NextResponse.json(
      { error: "You can only add a photo to items you added." },
      { status: 403 },
    );
  }

  const uploadKey = shoppingUploadKey(item.id);
  const previousKey = item.photoKey;

  try {
    const compressed = await compressPhoto(await getObjectBytes(uploadKey));
    const key = shoppingPhotoKey(item.id);
    await putObjectBytes(key, compressed.buffer, compressed.contentType);
    await db.update(shoppingItems).set({ photoKey: key }).where(eq(shoppingItems.id, item.id));
  } catch (error) {
    console.error("shopping photo processing failed", item.id, error);
    await cleanUp([uploadKey]);
    return NextResponse.json({ error: "That photo couldn't be saved. Try again." }, { status: 500 });
  }

  // The item is already pointing at the new photo, so both of these are now
  // dead weight: the upload it was made from, and whatever it replaced.
  await cleanUp([uploadKey, previousKey]);

  revalidatePath("/shopping");
  return NextResponse.json({ ok: true });
}

/** Bucket tidying is best-effort — a leftover object must never fail a request
 *  whose real work has already been committed. */
async function cleanUp(keys: (string | null)[]) {
  try {
    await deleteObjects(keys.filter((k): k is string => Boolean(k)));
  } catch (error) {
    console.error("shopping photo cleanup failed", error);
  }
}
