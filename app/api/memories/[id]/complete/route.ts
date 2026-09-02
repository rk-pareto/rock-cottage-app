import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { buildDerivatives } from "@/lib/storage/derivatives";
import { enqueueTranscode } from "@/lib/storage/transcode";
import { uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
// Full-resolution HEIC decoding is slow; give it room.
export const maxDuration = 120;

/**
 * Step 2 (spec §14.5): the browser has finished PUTting the original, so read
 * it back and build the derivatives.
 *
 * A video's playback copy is built afterwards, off the response path, by the
 * transcode queue — a multi-minute encode must never depend on a phone holding
 * a socket open.
 *
 * This is the happy path only. Nothing guarantees the browser ever gets here:
 * a phone that loses signal mid-PUT leaves a `pending` row behind and says
 * nothing to the server. `sweepStalledMedia` is what finishes those.
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

  // The clip's bytes are in the bucket, so its playback copy can start being
  // built. This runs after the response is sent and nothing waits on it.
  if (item.kind === "video") {
    after(() => {
      enqueueTranscode(item.id);
    });
  }

  if (item.processingStatus === "ready") return NextResponse.json({ status: "ready" });

  const status = await buildDerivatives(item);
  if (status === "ready") return NextResponse.json({ status: "ready" });

  return NextResponse.json(
    { status: "failed", error: "Photo saved, but the preview couldn't be created." },
    { status: 200 },
  );
}
