import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/membership";
import { PageHeader } from "@/components/ui/Card";
import { formatDuration, getMemories, withThumbnailUrls } from "@/lib/memories";
import { isStorageConfigured } from "@/lib/storage/s3";
import { MAX_SHAREABLE_VIDEO_BYTES } from "@/lib/validation/schemas";
import { MemoriesClient } from "./MemoriesClient";

export const metadata: Metadata = { title: "Memories · Rock Cottage" };

export default async function MemoriesPage() {
  const member = await requireMember();
  const storageReady = isStorageConfigured();
  const rows = storageReady ? await withThumbnailUrls(await getMemories()) : [];

  return (
    <>
      <PageHeader title="Memories" subtitle="Everyone&rsquo;s photos and videos from the week." />
      <MemoriesClient
        memories={rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          originalFilename: r.originalFilename,
          uploadedBy: r.uploadedBy,
          uploadedByMemberId: r.uploadedByMemberId,
          processingStatus: r.processingStatus,
          thumbnailUrl: r.thumbnailUrl,
          durationLabel: formatDuration(r.durationSeconds),
          shareable: r.kind === "image" || r.originalBytes <= MAX_SHAREABLE_VIDEO_BYTES,
          createdAt: r.createdAt.toISOString(),
        }))}
        currentMemberId={member.id}
        isAdmin={member.isAdmin}
        storageReady={storageReady}
      />
    </>
  );
}
