import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { getMemoryById } from "@/lib/memories";
import { presignDownload } from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Presigned download (spec §14.7). Any member may download any cottage memory;
 * the bucket itself is never public.
 *
 * `?variant=original` returns the untouched upload, anything else the
 * optimized display copy. A video has no optimized copy — it is stored exactly
 * as recorded — so both variants give back the clip itself.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/memories/[id]/download">) {
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

  const wantsOriginal = new URL(request.url).searchParams.get("variant") === "original";

  if (wantsOriginal || memory.kind === "video") {
    const url = await presignDownload(memory.originalKey, memory.originalFilename);
    return NextResponse.redirect(url);
  }

  if (!memory.displayKey) {
    return NextResponse.json({ error: "The optimized copy isn't ready yet." }, { status: 409 });
  }

  const base = memory.originalFilename.replace(/\.[^.]+$/, "");
  const url = await presignDownload(memory.displayKey, `${base}.webp`);
  return NextResponse.redirect(url);
}
