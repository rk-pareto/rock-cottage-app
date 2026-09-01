import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { originalKey, posterKey, presignUpload, isStorageConfigured } from "@/lib/storage/s3";
import { uploadIntentSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Step 1 of the upload flow (spec §14.5): create the pending row and hand back
 * a short-lived presigned PUT. The client never picks the object key.
 *
 * A video gets a second presigned PUT for the poster frame its browser grabbed
 * — that still is what becomes the thumbnail, so the server never has to
 * decode video.
 */
export async function POST(request: Request) {
  let member;
  try {
    member = await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Memory storage isn't configured yet." }, { status: 503 });
  }

  const parsed = uploadIntentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That file isn't supported." },
      { status: 400 },
    );
  }

  const {
    filename,
    contentType,
    bytes,
    kind,
    width,
    height,
    durationSeconds,
    hasPoster,
    retryOfMemoryId,
  } = parsed.data;
  const isVideo = kind === "video";

  // Shared by the insert and the retry update — a retry may be of a different
  // file to the one the abandoned row was created for (the picker was reopened),
  // so every field is restated rather than assumed unchanged.
  const details = {
    kind,
    originalFilename: filename,
    originalContentType: contentType,
    originalBytes: bytes,
    // A still's real dimensions come from decoding it; a clip's can only
    // come from the browser that just played it.
    originalWidth: isVideo ? (width ?? null) : null,
    originalHeight: isVideo ? (height ?? null) : null,
    durationSeconds: isVideo && durationSeconds !== undefined ? Math.round(durationSeconds) : null,
    processingStatus: "pending" as const,
    processingError: null,
    // A clip queues for its playback copy from the moment the row exists, so
    // the boot sweep also picks up uploads that never made it to /complete.
    playbackStatus: isVideo ? ("pending" as const) : null,
  };

  // A retry re-presigns onto the row the failed attempt already made, so
  // trying again doesn't leave a second, orphaned row behind. Only the
  // member's own row, and only one that never finished: a "ready" memory has
  // real bytes and derivatives that must not be overwritten by a stray retry.
  const id = retryOfMemoryId ? await claimForRetry(retryOfMemoryId, member.id) : null;
  if (retryOfMemoryId && !id) {
    return NextResponse.json({ error: "That upload can't be retried." }, { status: 409 });
  }

  let memoryId = id;
  if (!memoryId) {
    const [row] = await db
      .insert(media)
      .values({
        ...details,
        // Placeholder — replaced below once the generated id is known.
        originalKey: "",
        uploadedByMemberId: member.id,
      })
      .returning({ id: media.id });

    if (!row) {
      return NextResponse.json({ error: "Couldn't start that upload." }, { status: 500 });
    }
    memoryId = row.id;
  }

  const key = originalKey(memoryId, filename);
  const poster = isVideo && hasPoster ? posterKey(memoryId) : null;
  await db
    .update(media)
    .set({
      ...details,
      originalKey: key,
      posterKey: poster,
      // A retry of what was a video with a poster, as a photo, must not keep
      // pointing at derivatives built from the abandoned attempt.
      displayKey: null,
      thumbnailKey: null,
      updatedAt: new Date(),
    })
    .where(eq(media.id, memoryId));

  const [uploadUrl, posterUploadUrl] = await Promise.all([
    presignUpload(key, contentType),
    poster ? presignUpload(poster, "image/jpeg") : Promise.resolve(null),
  ]);

  return NextResponse.json({ memoryId, kind, uploadUrl, posterUploadUrl });
}

/**
 * The id of the caller's own unfinished row, or null if there isn't one to
 * re-use — a row belonging to someone else, an already-ready memory, or an id
 * for a memory that has since been deleted.
 */
async function claimForRetry(memoryId: string, memberId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: media.id })
    .from(media)
    .where(
      and(
        eq(media.id, memoryId),
        eq(media.uploadedByMemberId, memberId),
        ne(media.processingStatus, "ready"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
