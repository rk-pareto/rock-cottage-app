import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { canEditShoppingItem, getShoppingItemById } from "@/lib/shopping";
import { isStorageConfigured, presignUpload, shoppingUploadKey } from "@/lib/storage/s3";
import { shoppingPhotoIntentSchema, uuidSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Step 1 of attaching a photo to a shopping item: hand back a short-lived
 * presigned PUT aimed at the item's scratch key. Same shape as the memory
 * upload intent (spec §14.5) and for the same reason — the phone's bytes go
 * straight to the bucket, and the client never picks where they land.
 *
 * There is no row to create here: the item already exists, and it only learns
 * about the photo once the compressed copy has actually been written.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/shopping/[id]/photo-intent">) {
  let member;
  try {
    member = await requireMember();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Photo storage isn't configured yet." }, { status: 503 });
  }

  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Unknown item" }, { status: 400 });

  const item = await getShoppingItemById(parsedId.data);
  if (!item) return NextResponse.json({ error: "That item is gone." }, { status: 404 });
  if (!canEditShoppingItem(item, member)) {
    return NextResponse.json(
      { error: "You can only add a photo to items you added." },
      { status: 403 },
    );
  }

  const parsed = shoppingPhotoIntentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That file isn't supported." },
      { status: 400 },
    );
  }

  const uploadUrl = await presignUpload(shoppingUploadKey(item.id), parsed.data.contentType);
  return NextResponse.json({ uploadUrl });
}
