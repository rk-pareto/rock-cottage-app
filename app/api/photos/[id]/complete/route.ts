import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { processImage } from "@/lib/storage/process";
import {
  displayKey,
  getObjectBytes,
  putObjectBytes,
  thumbnailKey,
} from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
// Full-resolution HEIC decoding is slow; give it room.
export const maxDuration = 120;

/**
 * Step 2 (spec §14.5): the browser has finished PUTting the original, so read
 * it back and build the derivatives.
 *
 * Original preservation outranks derivative generation — a processing failure
 * marks the row "failed" and leaves the original object completely alone
 * (spec §14.6).
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/photos/[id]/complete">) {
  try {
    await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Unknown photo" }, { status: 400 });
  }

  const [photo] = await db.select().from(photos).where(eq(photos.id, parsedId.data)).limit(1);
  if (!photo) return NextResponse.json({ error: "Unknown photo" }, { status: 404 });
  if (photo.processingStatus === "ready") return NextResponse.json({ status: "ready" });

  await db
    .update(photos)
    .set({ processingStatus: "processing", processingError: null, updatedAt: new Date() })
    .where(eq(photos.id, photo.id));

  try {
    const original = await getObjectBytes(photo.originalKey);
    const processed = await processImage(original);

    const dKey = displayKey(photo.id);
    const tKey = thumbnailKey(photo.id);
    await Promise.all([
      putObjectBytes(dKey, processed.display.buffer, processed.display.contentType),
      putObjectBytes(tKey, processed.thumbnail.buffer, processed.thumbnail.contentType),
    ]);

    await db
      .update(photos)
      .set({
        displayKey: dKey,
        thumbnailKey: tKey,
        originalWidth: processed.width,
        originalHeight: processed.height,
        processingStatus: "ready",
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(photos.id, photo.id));

    return NextResponse.json({ status: "ready" });
  } catch (error) {
    console.error("photo processing failed", photo.id, error);
    await db
      .update(photos)
      .set({
        processingStatus: "failed",
        processingError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(photos.id, photo.id));

    return NextResponse.json(
      { status: "failed", error: "Photo saved, but the preview couldn't be created." },
      { status: 200 },
    );
  }
}
