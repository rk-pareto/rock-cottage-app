import "server-only";
import { desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { feedPostDismissals, feedPosts, media, members, type MediaKind } from "@/db/schema";
import { presignView } from "@/lib/storage/s3";

export type FeedPostRow = {
  id: string;
  body: string | null;
  authorMemberId: string;
  author: string;
  createdAt: Date;
  media: {
    id: string;
    kind: MediaKind;
    thumbnailKey: string | null;
    processingStatus: string;
  } | null;
};

export type FeedPostCard = FeedPostRow & { thumbnailUrl: string | null };

/**
 * Every post nobody currently signed in has dismissed, newest first. There's
 * no global "everyone's seen it" state — dismissal is entirely per member
 * (spec-equivalent to how favorites stay private), so this is the one query
 * that has to know whose feed it's building.
 */
export async function getActiveFeedPosts(memberId: string): Promise<FeedPostRow[]> {
  const dismissed = await db
    .select({ postId: feedPostDismissals.postId })
    .from(feedPostDismissals)
    .where(eq(feedPostDismissals.memberId, memberId));
  const dismissedIds = dismissed.map((d) => d.postId);

  const rows = await db
    .select({
      id: feedPosts.id,
      body: feedPosts.body,
      authorMemberId: feedPosts.authorMemberId,
      author: members.displayName,
      createdAt: feedPosts.createdAt,
      mediaId: media.id,
      mediaKind: media.kind,
      mediaThumbnailKey: media.thumbnailKey,
      mediaProcessingStatus: media.processingStatus,
    })
    .from(feedPosts)
    .innerJoin(members, eq(members.id, feedPosts.authorMemberId))
    .leftJoin(media, eq(media.id, feedPosts.mediaId))
    .where(dismissedIds.length > 0 ? notInArray(feedPosts.id, dismissedIds) : undefined)
    .orderBy(desc(feedPosts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    authorMemberId: row.authorMemberId,
    author: row.author,
    createdAt: row.createdAt,
    media: row.mediaId
      ? {
          id: row.mediaId,
          kind: row.mediaKind!,
          thumbnailKey: row.mediaThumbnailKey,
          processingStatus: row.mediaProcessingStatus!,
        }
      : null,
  }));
}

/** Attach a short-lived presigned thumbnail URL to each post's attachment,
 *  same pattern as {@link import("./memories").withThumbnailUrls}. */
export async function withPostThumbnailUrls(rows: FeedPostRow[]): Promise<FeedPostCard[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      thumbnailUrl: row.media?.thumbnailKey
        ? await presignView(row.media.thumbnailKey).catch(() => null)
        : null,
    })),
  );
}
