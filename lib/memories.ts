import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { media, members, memoryFavorites, type MediaKind } from "@/db/schema";
import { UPLOAD_NEVER_LANDED } from "@/lib/storage/derivatives";
import { presignView } from "@/lib/storage/s3";
import { MAX_SHAREABLE_VIDEO_BYTES } from "@/lib/validation/schemas";

export type MemoryRow = {
  id: string;
  kind: MediaKind;
  originalFilename: string;
  originalBytes: number;
  /** Size of what `/view` and `/share` actually serve for a video; null on an
   *  image and until the playback pass has finished. */
  playbackBytes: number | null;
  /** Bucket key of the transcoded MP4. Null on an image, until the pass has
   *  finished, and on a clip that already was one — see `hasPlaybackCopy`. */
  playbackKey: string | null;
  uploadedBy: string;
  uploadedByMemberId: string;
  processingStatus: string;
  processingError: string | null;
  thumbnailKey: string | null;
  displayKey: string | null;
  createdAt: Date;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export type MemoryCard = MemoryRow & {
  thumbnailUrl: string | null;
  /** The full-size copy the viewer shows: the display derivative on a photo,
   *  the poster still on a video. */
  displayUrl: string | null;
};

function selectMemories() {
  return db
    .select({
      id: media.id,
      kind: media.kind,
      originalFilename: media.originalFilename,
      originalBytes: media.originalBytes,
      playbackBytes: media.playbackBytes,
      playbackKey: media.playbackKey,
      uploadedBy: members.displayName,
      uploadedByMemberId: media.uploadedByMemberId,
      processingStatus: media.processingStatus,
      processingError: media.processingError,
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
 * Attach short-lived presigned URLs for both sizes. The bucket stays private —
 * these expire, and the page re-renders every 30 seconds anyway. A video's
 * thumbnail is the still made from its poster frame, so this is the same
 * lookup either way.
 *
 * The display copy is signed here rather than fetched through
 * `/api/memories/[id]/view`, so opening a photo goes straight at the bucket
 * instead of waiting on a round trip through the app — auth, a row lookup and
 * a redirect — before the first byte of the image moves. The route stays as
 * the fallback for a signature that has since expired.
 */
export async function withViewUrls(rows: MemoryRow[]): Promise<MemoryCard[]> {
  const sign = (key: string | null) => (key ? presignView(key).catch(() => null) : null);
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      thumbnailUrl: await sign(row.thumbnailKey),
      displayUrl: await sign(row.displayKey),
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

/**
 * Whether the Share button should appear: the OS share sheet needs the whole
 * file in memory, which a phone won't do past a point.
 *
 * Measured against whatever `/share` would actually send — the transcoded
 * playback copy once it exists — so a clip that was too big as recorded
 * becomes shareable the moment its playback pass lands.
 */
export function isShareable(memory: Pick<MemoryRow, "kind" | "originalBytes" | "playbackBytes">) {
  if (memory.kind === "image") return true;
  return (memory.playbackBytes ?? memory.originalBytes) <= MAX_SHAREABLE_VIDEO_BYTES;
}

/**
 * Whether there is a separate transcoded MP4 to offer — the only case where
 * `/download?variant=playback` has anything to hand back, and the only case
 * where `/share` sends MP4 bytes rather than the original's.
 *
 * A null key means both the pass that hasn't landed yet and the clip that was
 * already an ordinary H.264 MP4 and so needed no second copy; neither has an
 * object to download.
 */
export function hasPlaybackCopy(memory: Pick<MemoryRow, "kind" | "playbackKey">) {
  return memory.kind === "video" && memory.playbackKey !== null;
}

/**
 * Whether this memory's bytes never reached the bucket, as opposed to having
 * arrived and merely failed to produce a preview.
 *
 * Both are `failed` rows with no derivatives, and the grid must not tell
 * someone their photo is safe when it isn't there at all: this one can only be
 * fixed by sending the file again, the other has an original in the bucket
 * that is still downloadable and shareable.
 */
export function uploadIncomplete(
  memory: Pick<MemoryRow, "processingStatus" | "processingError">,
): boolean {
  return memory.processingStatus === "failed" && memory.processingError === UPLOAD_NEVER_LANDED;
}

/** `0:07`, `1:42`, `12:05` — the badge in the corner of a video tile. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
