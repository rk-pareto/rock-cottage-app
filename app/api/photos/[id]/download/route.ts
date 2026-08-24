import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { getPhotoById } from "@/lib/photos";
import { presignDownload } from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Presigned download (spec §14.7). Any member may download any cottage photo;
 * the bucket itself is never public.
 *
 * `?variant=original` returns the untouched upload, anything else the
 * optimized display copy.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/photos/[id]/download">) {
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

  const wantsOriginal = new URL(request.url).searchParams.get("variant") === "original";

  if (wantsOriginal) {
    const url = await presignDownload(photo.originalKey, photo.originalFilename);
    return NextResponse.redirect(url);
  }

  if (!photo.displayKey) {
    return NextResponse.json(
      { error: "The optimized copy isn't ready yet." },
      { status: 409 },
    );
  }

  const base = photo.originalFilename.replace(/\.[^.]+$/, "");
  const url = await presignDownload(photo.displayKey, `${base}.webp`);
  return NextResponse.redirect(url);
}
