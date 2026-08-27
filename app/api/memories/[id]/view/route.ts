import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { getMemoryById } from "@/lib/memories";
import { presignView } from "@/lib/storage/s3";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Inline view of a memory — used as the lightbox `src`.
 *
 * A photo resolves to its optimized display copy. A video resolves to the
 * original clip, redirected straight at the bucket so range requests (the
 * scrubbing and buffering a `<video>` element does) are served by S3 rather
 * than proxied through Next.
 *
 * `?variant=poster` returns the still behind a video, for its poster frame.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/memories/[id]/view">) {
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

  const wantsPoster = new URL(request.url).searchParams.get("variant") === "poster";
  const key =
    memory.kind === "video" && !wantsPoster ? memory.originalKey : memory.displayKey;

  if (!key) return NextResponse.json({ error: "Not ready" }, { status: 404 });

  return NextResponse.redirect(await presignView(key), {
    headers: {
      // Let the browser reuse this redirect — and therefore the same signed
      // URL, whose bytes it has cached — so swiping back to a photo doesn't
      // re-download it. Kept well under the presign TTL so a cached redirect
      // never points at an expired signature.
      "cache-control": "private, max-age=300",
    },
  });
}
