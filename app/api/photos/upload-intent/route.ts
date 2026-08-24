import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { originalKey, presignUpload, isStorageConfigured } from "@/lib/storage/s3";
import { uploadIntentSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Step 1 of the upload flow (spec §14.5): create the pending row and hand back
 * a short-lived presigned PUT. The client never picks the object key.
 */
export async function POST(request: Request) {
  let member;
  try {
    member = await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Photo storage isn't configured yet." }, { status: 503 });
  }

  const parsed = uploadIntentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That file isn't supported." },
      { status: 400 },
    );
  }

  const { filename, contentType, bytes } = parsed.data;

  const [row] = await db
    .insert(photos)
    .values({
      // Placeholder — replaced below once the generated id is known.
      originalKey: "",
      originalFilename: filename,
      originalContentType: contentType,
      originalBytes: bytes,
      uploadedByMemberId: member.id,
      processingStatus: "pending",
    })
    .returning({ id: photos.id });

  if (!row) {
    return NextResponse.json({ error: "Couldn't start that upload." }, { status: 500 });
  }

  const key = originalKey(row.id, filename);
  await db.update(photos).set({ originalKey: key }).where(eq(photos.id, row.id));

  const uploadUrl = await presignUpload(key, contentType);
  return NextResponse.json({ photoId: row.id, uploadUrl });
}
