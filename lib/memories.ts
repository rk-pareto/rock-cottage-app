import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { media, members, memoryFavorites, type MediaKind } from "@/db/schema";
import { presignView } from "@/lib/storage/s3";

export type MemoryRow = {
  id: string;
  kind: MediaKind;
  originalFilename: string;
  originalBytes: number;
  uploadedBy: string;
  uploadedByMemberId: string;
  processingStatus: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  createdAt: Date;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export type MemoryCard = MemoryRow & { thumbnailUrl: string | null };

function selectMemories() {
  return db
    .select({
      id: media.id,
      kind: media.kind,
      originalFilename: media.originalFilename,
      originalBytes: media.originalBytes,
      uploadedBy: members.displayName,
      uploadedByMemberId: media.uploadedByMemberId,
      processingStatus: media.processingStatus,
      thumbnailKey: media.thumbnailKey,
      displayKey: media.displayKey,
      createdAt: media.createdAt,
      width: media.originalWidth,
      height: media.originalHeight,
      durationSeconds: media.durationSeconds,
    })
    .from(media)
    .innerJoin(members, eq(members.id, media.uploadedByMemberId));
}

/** Newest first (spec §14.9). Pending/failed rows are included so the
 *  uploader can see and retry them. */
export async function getMemories(limit = 200): Promise<MemoryRow[]> {
  return selectMemories().orderBy(desc(media.createdAt)).limit(limit);
}

/** Home feed: the latest ready memories only. */
export async function getReadyMemories(limit = 6): Promise<MemoryRow[]> {
  return selectMemories()
    .where(eq(media.processingStatus, "ready"))
    .orderBy(desc(media.createdAt))
    .limit(limit);
}

/**
 * Attach short-lived presigned thumbnail URLs. The bucket stays private —
 * these expire, and the page re-renders every 30 seconds anyway. A video's
 * thumbnail is the still made from its poster frame, so this is the same
 * lookup either way.
 */
export async function withThumbnailUrls(rows: MemoryRow[]): Promise<MemoryCard[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      thumbnailUrl: row.thumbnailKey ? await presignView(row.thumbnailKey).catch(() => null) : null,
    })),
  );
}

/**
 * A member's own favorited memory ids. Scoped to one member_id only — there
 * is no query anywhere that lists favorites across members (spec: favorites
 * stay private).
 */
export async function getFavoriteMemoryIds(memberId: string): Promise<Set<string>> {
  const rows = await db
    .select({ memoryId: memoryFavorites.memoryId })
    .from(memoryFavorites)
    .where(eq(memoryFavorites.memberId, memberId));
  return new Set(rows.map((r) => r.memoryId));
}

export async function getMemoryById(id: string) {
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  return row ?? null;
}

/** `0:07`, `1:42`, `12:05` — the badge in the corner of a video tile. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
