"use client";

import { useCallback, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { deletePhoto } from "./actions";

export type PhotoCardData = {
  id: string;
  originalFilename: string;
  uploadedBy: string;
  uploadedByMemberId: string;
  processingStatus: string;
  thumbnailUrl: string | null;
  createdAt: string;
};

type UploadState = {
  key: string;
  name: string;
  stage: "uploading" | "processing" | "done" | "failed";
  message?: string;
};

export function PhotosClient({
  photos,
  currentMemberId,
  isAdmin,
  storageReady,
}: {
  photos: PhotoCardData[];
  currentMemberId: string;
  isAdmin: boolean;
  storageReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const sharePrefetch = useRef<{ id: string; file: Promise<File> } | null>(null);
  // False during SSR, so the button appears only once hydration has asked the
  // browser — no markup mismatch.
  const canShareFiles = useSyncExternalStore(subscribeNever, supportsFileSharing, () => false);

  const setStage = useCallback(
    (key: string, stage: UploadState["stage"], message?: string) => {
      setUploads((current) =>
        current.map((u) => (u.key === key ? { ...u, stage, message } : u)),
      );
    },
    [],
  );

  /** Upload one file end to end: intent → direct PUT → complete. */
  const uploadOne = useCallback(
    async (file: File, key: string) => {
      try {
        const intentResponse = await fetch("/api/photos/upload-intent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            // Some phones report an empty type for HEIC; fall back by extension.
            contentType: file.type || guessContentType(file.name),
            bytes: file.size,
          }),
        });

        if (!intentResponse.ok) {
          const body = await intentResponse.json().catch(() => ({}));
          setStage(key, "failed", body.error ?? "Upload couldn't start.");
          return;
        }

        const { photoId, uploadUrl } = (await intentResponse.json()) as {
          photoId: string;
          uploadUrl: string;
        };

        // The original goes straight to the bucket, never through Next.
        const putResponse = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || guessContentType(file.name) },
        });
        if (!putResponse.ok) {
          setStage(key, "failed", "The upload didn't finish.");
          return;
        }

        setStage(key, "processing");
        const completeResponse = await fetch(`/api/photos/${photoId}/complete`, {
          method: "POST",
        });
        const completeBody = (await completeResponse.json().catch(() => ({}))) as {
          status?: string;
          error?: string;
        };

        if (completeBody.status === "ready") {
          setStage(key, "done");
        } else {
          setStage(key, "failed", completeBody.error ?? "Preview couldn't be created.");
        }
        router.refresh();
      } catch {
        setStage(key, "failed", "Something went wrong. Try again.");
      }
    },
    [router, setStage],
  );

  /**
   * Fetch the shareable JPEG, reusing the copy started when the lightbox
   * opened. iOS drops the user gesture across a real network round trip, so by
   * the time Share is tapped these bytes should already be in hand.
   */
  const shareFileFor = useCallback((photo: PhotoCardData): Promise<File> => {
    const cached = sharePrefetch.current;
    if (cached?.id === photo.id) return cached.file;

    const file = fetch(`/api/photos/${photo.id}/share`).then(async (response) => {
      if (!response.ok) throw new Error("Share bytes unavailable");
      const base = photo.originalFilename.replace(/\.[^.]+$/, "") || "photo";
      return new File([await response.blob()], `${base}.jpg`, { type: "image/jpeg" });
    });
    void file.catch(() => {}); // a prefetch nobody shares must not go unhandled
    sharePrefetch.current = { id: photo.id, file };
    return file;
  }, []);

  function openLightbox(photo: PhotoCardData) {
    setLightboxId(photo.id);
    if (canShareFiles) void shareFileFor(photo);
  }

  async function share(photo: PhotoCardData) {
    setIsSharing(true);
    try {
      await navigator.share({ files: [await shareFileFor(photo)] });
    } catch (error) {
      // Dismissing the share sheet is an AbortError, not a failure.
      if ((error as Error)?.name === "AbortError") return;
      sharePrefetch.current = null;
      toast("Couldn't share that photo.", "error");
    } finally {
      setIsSharing(false);
    }
  }

  async function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // let the same file be re-picked
    if (files.length === 0) return;

    const entries = files.map((file, index) => ({
      file,
      key: `${Date.now()}-${index}-${file.name}`,
    }));
    setUploads((current) => [
      ...current,
      ...entries.map(({ file, key }) => ({
        key,
        name: file.name,
        stage: "uploading" as const,
      })),
    ]);

    // Sequential: kinder to phone radios and to the server's image workers.
    for (const { file, key } of entries) {
      await uploadOne(file, key);
    }
  }

  function remove(photo: PhotoCardData) {
    startTransition(async () => {
      const result = await deletePhoto(photo.id);
      setConfirmingId(null);
      if (result.ok) {
        setLightboxId(null);
        toast("Photo deleted");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  const activeUploads = uploads.filter((u) => u.stage !== "done");
  const lightboxPhoto = photos.find((p) => p.id === lightboxId) ?? null;
  const canDelete = (photo: PhotoCardData) =>
    photo.uploadedByMemberId === currentMemberId || isAdmin;

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={onFilesChosen}
        className="hidden"
      />
      <button
        type="button"
        disabled={!storageReady}
        onClick={() => fileInput.current?.click()}
        className="tap mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3.5 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.99] disabled:opacity-30"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          +
        </span>
        {storageReady ? "Add photos" : "Photo storage isn't set up yet"}
      </button>

      {activeUploads.length > 0 ? (
        <ul className="mb-5 overflow-hidden rounded-xl border border-line">
          {activeUploads.map((upload) => (
            <li
              key={upload.key}
              className="flex items-center gap-3 border-b border-line bg-card px-3 py-2.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-ink">{upload.name}</span>
              <span
                className={`label shrink-0 ${
                  upload.stage === "failed" ? "text-clay" : "text-muted"
                }`}
              >
                {upload.stage === "uploading"
                  ? "Uploading…"
                  : upload.stage === "processing"
                    ? "Processing…"
                    : (upload.message ?? "Failed")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {photos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center text-sm text-muted">
          No photos yet. Someone go take a picture of the lake.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1">
          {photos.map((photo) => (
            <li key={photo.id} className="aspect-square">
              {photo.thumbnailUrl ? (
                <button
                  type="button"
                  onClick={() => openLightbox(photo)}
                  className="group h-full w-full overflow-hidden rounded-lg bg-subtle"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnailUrl}
                    alt={`Uploaded by ${photo.uploadedBy}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </button>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-line-strong p-1 text-center">
                  <span className="text-[10px] font-bold text-muted">
                    {photo.processingStatus === "failed" ? "No preview" : "Processing…"}
                  </span>
                  {canDelete(photo) ? (
                    <button
                      type="button"
                      onClick={() => remove(photo)}
                      className="mt-1 text-[10px] font-bold text-clay"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {lightboxPhoto ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <span className="label min-w-0 truncate text-white/60">
              {lightboxPhoto.uploadedBy}
            </span>
            <button
              type="button"
              onClick={() => setLightboxId(null)}
              className="tap rounded-lg px-3 py-2 text-xs font-extrabold text-white/80 transition-colors hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/${lightboxPhoto.id}/view`}
              alt={`Uploaded by ${lightboxPhoto.uploadedBy}`}
              className="max-h-full max-w-full object-contain"
            />
          </div>

          <div className="flex flex-wrap gap-2 p-3 safe-bottom">
            {canShareFiles ? (
              <button
                type="button"
                onClick={() => share(lightboxPhoto)}
                disabled={isSharing}
                className="tap w-full rounded-xl bg-white px-4 py-3 text-center text-xs font-extrabold tracking-tight text-ink transition-opacity disabled:opacity-60"
              >
                {isSharing ? "Preparing…" : "Share photo"}
              </button>
            ) : null}
            <a
              href={`/api/photos/${lightboxPhoto.id}/download?variant=display`}
              className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
            >
              Download optimized
            </a>
            <a
              href={`/api/photos/${lightboxPhoto.id}/download?variant=original`}
              className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
            >
              Download original
            </a>
            {canDelete(lightboxPhoto) ? (
              confirmingId === lightboxPhoto.id ? (
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={() => remove(lightboxPhoto)}
                    className="tap flex-1 rounded-xl bg-clay px-4 py-3 text-xs font-extrabold tracking-tight text-white"
                  >
                    Delete for everyone
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="tap rounded-xl px-4 py-3 text-xs font-extrabold tracking-tight text-white/70"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(lightboxPhoto.id)}
                  className="tap w-full rounded-xl border border-white/20 px-4 py-3 text-xs font-extrabold tracking-tight text-white/70 transition-colors hover:text-white"
                >
                  Delete
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

const subscribeNever = () => () => {};

/**
 * Can this browser hand a file to the OS share sheet? Sharing the *file* is
 * what puts the photo into WhatsApp or Messages — a link to this app would be
 * useless outside the family. Most desktop browsers can't, so the button is
 * hidden there. The answer can't change for the life of the page, so it is
 * asked once.
 */
let fileSharingSupport: boolean | undefined;
function supportsFileSharing(): boolean {
  if (fileSharingSupport === undefined) {
    try {
      const probe = new File([new Uint8Array(1)], "probe.jpg", { type: "image/jpeg" });
      fileSharingSupport =
        typeof navigator.share === "function" && Boolean(navigator.canShare?.({ files: [probe] }));
    } catch {
      fileSharingSupport = false;
    }
  }
  return fileSharingSupport;
}

function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}
