import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { getPhotoById } from "@/lib/photos";
import { presignView } from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/** Inline view of the optimized display copy — used as the lightbox `src`. */
export async function GET(_request: Request, ctx: RouteContext<"/api/photos/[id]/view">) {
  try {
    await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Unknown photo" }, { status: 400 });

  const photo = await getPhotoById(parsedId.data);
  if (!photo?.displayKey) {
    return NextResponse.json({ error: "Not ready" }, { status: 404 });
  }

  return NextResponse.redirect(await presignView(photo.displayKey));
}
