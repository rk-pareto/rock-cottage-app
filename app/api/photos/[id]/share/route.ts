import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { getPhotoById } from "@/lib/photos";
import { toShareableJpeg } from "@/lib/storage/process";
import { getObjectBytes } from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * JPEG bytes for the Web Share sheet (WhatsApp, Messages, Mail…).
 *
 * The other photo routes redirect to a presigned bucket URL, which the browser
 * can render but `fetch()` can't read cross-origin — and the share sheet needs
 * a real `File`. So these bytes stream through Next instead of redirecting.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/photos/[id]/share">) {
  try {
    await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Unknown photo" }, { status: 400 });

  const photo = await getPhotoById(parsedId.data);
  if (!photo) return NextResponse.json({ error: "Unknown photo" }, { status: 404 });
  if (!photo.displayKey) {
    return NextResponse.json({ error: "The optimized copy isn't ready yet." }, { status: 409 });
  }

  let jpeg: Buffer;
  try {
    jpeg = await toShareableJpeg(await getObjectBytes(photo.displayKey));
  } catch (error) {
    console.error("Share encode failed", error);
    return NextResponse.json({ error: "Couldn't prepare the photo." }, { status: 500 });
  }

  const base = photo.originalFilename.replace(/\.[^.]+$/, "").replace(/"/g, "");
  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(jpeg.byteLength),
      "content-disposition": `inline; filename="${base || "photo"}.jpg"`,
      // Members only, and the same photo is often shared to two apps in a row.
      "cache-control": "private, max-age=300",
    },
  });
}
