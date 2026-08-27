import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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

  const { filename, contentType, bytes, kind, width, height, durationSeconds, hasPoster } =
    parsed.data;
  const isVideo = kind === "video";

  const [row] = await db
    .insert(media)
    .values({
      kind,
      // Placeholder — replaced below once the generated id is known.
      originalKey: "",
      originalFilename: filename,
      originalContentType: contentType,
      originalBytes: bytes,
      // A still's real dimensions come from decoding it; a clip's can only
      // come from the browser that just played it.
      originalWidth: isVideo ? (width ?? null) : null,
      originalHeight: isVideo ? (height ?? null) : null,
      durationSeconds: isVideo && durationSeconds !== undefined ? Math.round(durationSeconds) : null,
      uploadedByMemberId: member.id,
      processingStatus: "pending",
      // A clip queues for its playback copy from the moment the row exists, so
      // the boot sweep also picks up uploads that never made it to /complete.
      playbackStatus: isVideo ? "pending" : null,
    })
    .returning({ id: media.id });

  if (!row) {
    return NextResponse.json({ error: "Couldn't start that upload." }, { status: 500 });
  }

  const key = originalKey(row.id, filename);
  const poster = isVideo && hasPoster ? posterKey(row.id) : null;
  await db
    .update(media)
    .set({ originalKey: key, posterKey: poster })
    .where(eq(media.id, row.id));

  const [uploadUrl, posterUploadUrl] = await Promise.all([
    presignUpload(key, contentType),
    poster ? presignUpload(poster, "image/jpeg") : Promise.resolve(null),
  ]);

  return NextResponse.json({ memoryId: row.id, kind, uploadUrl, posterUploadUrl });
}
