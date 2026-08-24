import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/membership";
import { getPhotos, withThumbnailUrls } from "@/lib/photos";
import { isStorageConfigured } from "@/lib/storage/s3";
import { PhotosClient } from "./PhotosClient";

export const metadata: Metadata = { title: "Photos · Rock Cottage" };

export default async function PhotosPage() {
  const member = await requireMember();
  const storageReady = isStorageConfigured();
  const rows = storageReady ? await withThumbnailUrls(await getPhotos()) : [];

  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Photos</h1>
      <p className="mb-4 text-sm text-muted">Everyone&apos;s pictures from the week.</p>
      <PhotosClient
        photos={rows.map((r) => ({
          id: r.id,
          originalFilename: r.originalFilename,
          uploadedBy: r.uploadedBy,
          uploadedByMemberId: r.uploadedByMemberId,
          processingStatus: r.processingStatus,
          thumbnailUrl: r.thumbnailUrl,
          createdAt: r.createdAt.toISOString(),
        }))}
        currentMemberId={member.id}
        isAdmin={member.isAdmin}
        storageReady={storageReady}
      />
    </>
  );
}
