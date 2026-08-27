import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { processImage } from "@/lib/storage/process";
import { displayKey, getObjectBytes, putObjectBytes, thumbnailKey } from "@/lib/storage/s3";
import { enqueueTranscode } from "@/lib/storage/transcode";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
// Full-resolution HEIC decoding is slow; give it room.
export const maxDuration = 120;

/**
 * Step 2 (spec §14.5): the browser has finished PUTting the original, so read
 * it back and build the derivatives.
 *
 * A photo is derived from the upload itself. A video's tile is derived from
 * the poster frame the browser captured and PUT alongside it, so nothing here
 * has to open the clip; its playback copy is built afterwards, off the
 * response path, by the transcode queue.
 *
 * Original preservation outranks derivative generation — a processing failure
 * marks the row "failed" and leaves the original object completely alone
 * (spec §14.6). A video whose poster never arrived is still "ready": the clip
 * plays fine, it just shows a placeholder tile in the grid.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/memories/[id]/complete">) {
  try {
    await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Unknown memory" }, { status: 400 });
  }

  const [item] = await db.select().from(media).where(eq(media.id, parsedId.data)).limit(1);
  if (!item) return NextResponse.json({ error: "Unknown memory" }, { status: 404 });

  const isVideo = item.kind === "video";

  // The clip's bytes are in the bucket, so its playback copy can start being
  // built. This runs after the response is sent and nothing waits on it: a
  // multi-minute encode must never depend on a phone holding a socket open.
  if (isVideo) {
    after(() => {
      enqueueTranscode(item.id);
    });
  }

  if (item.processingStatus === "ready") return NextResponse.json({ status: "ready" });

  const sourceKey = isVideo ? item.posterKey : item.originalKey;

  // Nothing to derive from: the clip itself is already safely in the bucket.
  if (isVideo && !sourceKey) {
    await db
      .update(media)
      .set({ processingStatus: "ready", processingError: null, updatedAt: new Date() })
      .where(eq(media.id, item.id));
    return NextResponse.json({ status: "ready" });
  }

  await db
    .update(media)
    .set({ processingStatus: "processing", processingError: null, updatedAt: new Date() })
    .where(eq(media.id, item.id));

  try {
    const source = await getObjectBytes(sourceKey!);
    const processed = await processImage(source);

    const dKey = displayKey(item.id);
    const tKey = thumbnailKey(item.id);
    await Promise.all([
      putObjectBytes(dKey, processed.display.buffer, processed.display.contentType),
      putObjectBytes(tKey, processed.thumbnail.buffer, processed.thumbnail.contentType),
    ]);

    await db
      .update(media)
      .set({
        displayKey: dKey,
        thumbnailKey: tKey,
        // A clip's dimensions came from the browser at intent time and are
        // authoritative — the poster is only a frame of it.
        originalWidth: isVideo ? (item.originalWidth ?? processed.width) : processed.width,
        originalHeight: isVideo ? (item.originalHeight ?? processed.height) : processed.height,
        processingStatus: "ready",
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(media.id, item.id));

    return NextResponse.json({ status: "ready" });
  } catch (error) {
    console.error("memory processing failed", item.id, error);

    // The clip is intact and playable; only its poster failed to render.
    if (isVideo) {
      await db
        .update(media)
        .set({ processingStatus: "ready", processingError: null, updatedAt: new Date() })
        .where(eq(media.id, item.id));
      return NextResponse.json({ status: "ready" });
    }

    await db
      .update(media)
      .set({
        processingStatus: "failed",
        processingError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(media.id, item.id));

    return NextResponse.json(
      { status: "failed", error: "Photo saved, but the preview couldn't be created." },
      { status: 200 },
    );
  }
}
