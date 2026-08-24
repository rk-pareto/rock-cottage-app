import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { getMemoryById } from "@/lib/memories";
import { toShareableJpeg } from "@/lib/storage/process";
import { getObjectBytes, getObjectStream } from "@/lib/storage/s3";
import { MAX_SHAREABLE_VIDEO_BYTES, uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Bytes for the Web Share sheet (WhatsApp, Messages, Mail…).
 *
 * The other memory routes redirect to a presigned bucket URL, which the
 * browser can render but `fetch()` can't read cross-origin — and the share
 * sheet needs a real `File`. So these bytes stream through Next instead of
 * redirecting.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/memories/[id]/share">) {
  try {
    await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Unknown memory" }, { status: 400 });

  const memory = await getMemoryById(parsedId.data);
  if (!memory) return NextResponse.json({ error: "Unknown memory" }, { status: 404 });

  const base = memory.originalFilename.replace(/\.[^.]+$/, "").replace(/"/g, "") || "memory";

  // A clip goes out exactly as recorded — re-encoding video here would cost
  // far more than the share is worth, and it is streamed rather than buffered.
  if (memory.kind === "video") {
    if (memory.originalBytes > MAX_SHAREABLE_VIDEO_BYTES) {
      return NextResponse.json({ error: "That video is too big to share." }, { status: 413 });
    }

    let stream;
    try {
      stream = await getObjectStream(memory.originalKey);
    } catch (error) {
      console.error("Share stream failed", error);
      return NextResponse.json({ error: "Couldn't prepare the video." }, { status: 500 });
    }

    const extension = memory.originalFilename.match(/\.[^.]+$/)?.[0] ?? "";
    return new NextResponse(stream.body, {
      headers: {
        "content-type": stream.contentType ?? memory.originalContentType,
        ...(stream.contentLength ? { "content-length": String(stream.contentLength) } : {}),
        "content-disposition": `inline; filename="${base}${extension}"`,
        "cache-control": "private, max-age=300",
      },
    });
  }

  if (!memory.displayKey) {
    return NextResponse.json({ error: "The optimized copy isn't ready yet." }, { status: 409 });
  }

  let jpeg: Buffer;
  try {
    jpeg = await toShareableJpeg(await getObjectBytes(memory.displayKey));
  } catch (error) {
    console.error("Share encode failed", error);
    return NextResponse.json({ error: "Couldn't prepare the photo." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(jpeg.byteLength),
      "content-disposition": `inline; filename="${base}.jpg"`,
      // Members only, and the same photo is often shared to two apps in a row.
      "cache-control": "private, max-age=300",
    },
  });
}
