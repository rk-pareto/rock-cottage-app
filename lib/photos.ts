import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, photos } from "@/db/schema";
import { presignView } from "@/lib/storage/s3";

export type PhotoRow = {
  id: string;
  originalFilename: string;
  uploadedBy: string;
  uploadedByMemberId: string;
  processingStatus: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  createdAt: Date;
  width: number | null;
  height: number | null;
};

export type PhotoCard = PhotoRow & { thumbnailUrl: string | null };

function selectPhotos() {
  return db
    .select({
      id: photos.id,
      originalFilename: photos.originalFilename,
      uploadedBy: members.displayName,
      uploadedByMemberId: photos.uploadedByMemberId,
      processingStatus: photos.processingStatus,
      thumbnailKey: photos.thumbnailKey,
      displayKey: photos.displayKey,
      createdAt: photos.createdAt,
      width: photos.originalWidth,
      height: photos.originalHeight,
    })
    .from(photos)
    .innerJoin(members, eq(members.id, photos.uploadedByMemberId));
}

/** Newest first (spec §14.9). Pending/failed rows are included so the
 *  uploader can see and retry them. */
export async function getPhotos(limit = 200): Promise<PhotoRow[]> {
  return selectPhotos().orderBy(desc(photos.createdAt)).limit(limit);
}

/** Home feed: the latest ready photos only. */
export async function getReadyPhotos(limit = 6): Promise<PhotoRow[]> {
  return selectPhotos()
    .where(eq(photos.processingStatus, "ready"))
    .orderBy(desc(photos.createdAt))
    .limit(limit);
}

/**
 * Attach short-lived presigned thumbnail URLs. The bucket stays private —
 * these expire, and the page re-renders every 30 seconds anyway.
 */
export async function withThumbnailUrls(rows: PhotoRow[]): Promise<PhotoCard[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      thumbnailUrl: row.thumbnailKey ? await presignView(row.thumbnailKey).catch(() => null) : null,
    })),
  );
}

export async function getPhotoById(id: string) {
  const [row] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  return row ?? null;
}
