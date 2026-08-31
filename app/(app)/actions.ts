"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feedPostDismissals, feedPosts, media } from "@/db/schema";
import { requireMember } from "@/lib/auth/membership";
import { optionalTextSchema, uuidSchema } from "@/lib/validation/schemas";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/");
}

/**
 * Post a message to the top of everyone's feed (any member may — same trust
 * model as adding a shopping or bringing item). A post needs text, an
 * attachment, or both; an attachment must already be the caller's own memory,
 * uploaded moments earlier through the same pipeline `/memories` uses — the
 * client never gets to pin someone else's photo to their own message.
 */
export async function createFeedPost(body: string | null, mediaId: string | null): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  const parsedBody = optionalTextSchema.safeParse(body ?? "");
  if (!parsedBody.success) {
    return { ok: false, error: parsedBody.error.issues[0]?.message ?? "That message isn't valid." };
  }

  let ownedMediaId: string | null = null;
  if (mediaId) {
    const parsedMediaId = uuidSchema.safeParse(mediaId);
    if (!parsedMediaId.success) return { ok: false, error: "That attachment isn't valid." };

    const [item] = await db.select().from(media).where(eq(media.id, parsedMediaId.data)).limit(1);
    if (!item || item.uploadedByMemberId !== member.id) {
      return { ok: false, error: "You can only attach your own photos or videos." };
    }
    ownedMediaId = item.id;
  }

  if (!parsedBody.data && !ownedMediaId) {
    return { ok: false, error: "Write something or attach a photo or video." };
  }

  try {
    await db.insert(feedPosts).values({
      authorMemberId: member.id,
      body: parsedBody.data,
      mediaId: ownedMediaId,
    });
  } catch (error) {
    console.error("createFeedPost failed", error);
    return { ok: false, error: "Couldn't post that. Try again." };
  }

  revalidate();
  return { ok: true };
}

/**
 * Hide a post from the *current* member only — every other member still sees
 * it until they each do the same. Never a delete: see {@link deleteFeedPost}
 * for removing it everywhere.
 */
export async function dismissFeedPost(postId: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return { ok: false, error: "That post isn't valid." };

  try {
    await db
      .insert(feedPostDismissals)
      .values({ memberId: member.id, postId: parsed.data })
      .onConflictDoNothing();
  } catch (error) {
    console.error("dismissFeedPost failed", error);
    return { ok: false, error: "Couldn't dismiss that. Try again." };
  }

  revalidate();
  return { ok: true };
}

/** The author, or an admin, may remove a post for everyone (same rule as
 *  `deleteMemory`). The attached memory itself is untouched — deleting the
 *  post is not deleting the photo. */
export async function deleteFeedPost(postId: string): Promise<ActionResult> {
  let member;
  try {
    member = await requireMember();
  } catch {
    return { ok: false, error: "You're signed out. Sign in and try again." };
  }

  const parsed = uuidSchema.safeParse(postId);
  if (!parsed.success) return { ok: false, error: "That post isn't valid." };

  const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, parsed.data)).limit(1);
  if (!post) return { ok: true }; // already gone

  if (post.authorMemberId !== member.id && !member.isAdmin) {
    return { ok: false, error: "You can only delete your own posts." };
  }

  try {
    await db.delete(feedPosts).where(eq(feedPosts.id, post.id));
  } catch (error) {
    console.error("deleteFeedPost failed", error);
    return { ok: false, error: "Couldn't delete that. Try again." };
  }

  revalidate();
  return { ok: true };
}
