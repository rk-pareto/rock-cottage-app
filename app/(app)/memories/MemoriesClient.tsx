"use client";

import { useCallback, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { deleteMemory } from "./actions";

export type MemoryCardData = {
  id: string;
  kind: "image" | "video";
  originalFilename: string;
  uploadedBy: string;
  uploadedByMemberId: string;
  processingStatus: string;
  thumbnailUrl: string | null;
  durationLabel: string | null;
  /** False for clips too large to hand to the OS share sheet in one piece. */
  shareable: boolean;
  createdAt: string;
};

type UploadState = {
  key: string;
  name: string;
  stage: "uploading" | "processing" | "done" | "failed";
  /** 0–1 while the bytes are moving; a long video needs a real bar. */
  progress?: number;
  message?: string;
};

/** The poster frame is only ever a thumbnail source, so it stays small. */
const POSTER_MAX_EDGE = 1280;
const POSTER_QUALITY = 0.85;

export function MemoriesClient({
  memories,
  currentMemberId,
  isAdmin,
  storageReady,
}: {
  memories: MemoryCardData[];
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

  const patch = useCallback((key: string, changes: Partial<UploadState>) => {
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...changes } : u)));
  }, []);

  /** Upload one file end to end: intent → direct PUT (→ poster) → complete. */
  const uploadOne = useCallback(
    async (file: File, key: string) => {
      try {
        const contentType = file.type || guessContentType(file.name);
        const isVideo = contentType.startsWith("video/");

        // Ask the browser what it knows about the clip before anything moves:
        // its dimensions, its length, and a frame to use as the thumbnail.
        const probed = isVideo ? await probeVideo(file) : null;

        const intentResponse = await fetch("/api/memories/upload-intent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            // Some phones report an empty type for HEIC; fall back by extension.
            contentType,
            bytes: file.size,
            width: probed?.width,
            height: probed?.height,
            durationSeconds: probed?.durationSeconds,
            hasPoster: Boolean(probed?.poster),
          }),
        });

        if (!intentResponse.ok) {
          const body = await intentResponse.json().catch(() => ({}));
          patch(key, { stage: "failed", message: body.error ?? "Upload couldn't start." });
          return;
        }

        const { memoryId, uploadUrl, posterUploadUrl } = (await intentResponse.json()) as {
          memoryId: string;
          uploadUrl: string;
          posterUploadUrl: string | null;
        };

        // The original goes straight to the bucket, never through Next.
        const uploaded = await putToBucket(uploadUrl, file, contentType, (progress) =>
          patch(key, { progress }),
        );
        if (!uploaded) {
          patch(key, { stage: "failed", message: "The upload didn't finish." });
          return;
        }

        // Best effort: a clip with no poster still plays, it just shows a
        // placeholder tile in the grid.
        if (posterUploadUrl && probed?.poster) {
          await putToBucket(posterUploadUrl, probed.poster, "image/jpeg");
        }

        patch(key, { stage: "processing", progress: undefined });
        const completeResponse = await fetch(`/api/memories/${memoryId}/complete`, {
          method: "POST",
        });
        const completeBody = (await completeResponse.json().catch(() => ({}))) as {
          status?: string;
          error?: string;
        };

        if (completeBody.status === "ready") {
          patch(key, { stage: "done" });
        } else {
          patch(key, {
            stage: "failed",
            message: completeBody.error ?? "Preview couldn't be created.",
          });
        }
        router.refresh();
      } catch {
        patch(key, { stage: "failed", message: "Something went wrong. Try again." });
      }
    },
    [router, patch],
  );

  /**
   * Fetch the shareable bytes, reusing the copy started when the lightbox
   * opened. iOS drops the user gesture across a real network round trip, so by
   * the time Share is tapped these bytes should already be in hand.
   */
  const shareFileFor = useCallback((memory: MemoryCardData): Promise<File> => {
    const cached = sharePrefetch.current;
    if (cached?.id === memory.id) return cached.file;

    const file = fetch(`/api/memories/${memory.id}/share`).then(async (response) => {
      if (!response.ok) throw new Error("Share bytes unavailable");
      const blob = await response.blob();
      const base = memory.originalFilename.replace(/\.[^.]+$/, "") || "memory";
      // Photos always come back re-encoded as JPEG; clips come back as they
      // were recorded, so their own extension is the right one.
      const name =
        memory.kind === "video"
          ? `${base}${memory.originalFilename.match(/\.[^.]+$/)?.[0] ?? ".mp4"}`
          : `${base}.jpg`;
      return new File([blob], name, { type: blob.type || "application/octet-stream" });
    });
    void file.catch(() => {}); // a prefetch nobody shares must not go unhandled
    sharePrefetch.current = { id: memory.id, file };
    return file;
  }, []);

  function openLightbox(memory: MemoryCardData) {
    setLightboxId(memory.id);
    // Only prefetch a still: pulling a whole clip down for a share nobody
    // asked for would burn the phone's data on every tap.
    if (canShareFiles && memory.shareable && memory.kind === "image") {
      void shareFileFor(memory);
    }
  }

  async function share(memory: MemoryCardData) {
    setIsSharing(true);
    try {
      await navigator.share({ files: [await shareFileFor(memory)] });
    } catch (error) {
      // Dismissing the share sheet is an AbortError, not a failure.
      if ((error as Error)?.name === "AbortError") return;
      sharePrefetch.current = null;
      toast(`Couldn't share that ${memory.kind === "video" ? "video" : "photo"}.`, "error");
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

  function remove(memory: MemoryCardData) {
    startTransition(async () => {
      const result = await deleteMemory(memory.id);
      setConfirmingId(null);
      if (result.ok) {
        setLightboxId(null);
        toast(memory.kind === "video" ? "Video deleted" : "Photo deleted");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  const activeUploads = uploads.filter((u) => u.stage !== "done");
  const lightboxMemory = memories.find((m) => m.id === lightboxId) ?? null;
  const canDelete = (memory: MemoryCardData) =>
    memory.uploadedByMemberId === currentMemberId || isAdmin;

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,.heic,.heif,.mov,.m4v"
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
        {storageReady ? "Add photos or videos" : "Storage isn't set up yet"}
      </button>

      {activeUploads.length > 0 ? (
        <ul className="mb-5 overflow-hidden rounded-xl border border-line">
          {activeUploads.map((upload) => (
            <li
              key={upload.key}
              className="relative flex items-center gap-3 overflow-hidden border-b border-line bg-card px-3 py-2.5 text-sm last:border-b-0"
            >
              {/* The bar runs under the row rather than beside it — a long
                  video otherwise looks stuck for minutes. */}
              {upload.stage === "uploading" && upload.progress !== undefined ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-subtle transition-[width] duration-200"
                  style={{ width: `${Math.round(upload.progress * 100)}%` }}
                />
              ) : null}
              <span className="relative min-w-0 flex-1 truncate text-ink">{upload.name}</span>
              <span
                className={`label relative shrink-0 ${
                  upload.stage === "failed" ? "text-clay" : "text-muted"
                }`}
              >
                {upload.stage === "uploading"
                  ? upload.progress !== undefined
                    ? `${Math.round(upload.progress * 100)}%`
                    : "Uploading…"
                  : upload.stage === "processing"
                    ? "Processing…"
                    : (upload.message ?? "Failed")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {memories.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center text-sm text-muted">
          Nothing here yet. Someone go take a picture of the lake.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1">
          {memories.map((memory) => (
            <li key={memory.id} className="aspect-square">
              {/* A clip whose poster never made it is still openable once its
                  bytes have landed — it just has no still to show. */}
              {memory.thumbnailUrl ||
              (memory.kind === "video" && memory.processingStatus === "ready") ? (
                <button
                  type="button"
                  onClick={() => openLightbox(memory)}
                  className="group relative h-full w-full overflow-hidden rounded-lg bg-subtle"
                >
                  {memory.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={memory.thumbnailUrl}
                      alt={`Added by ${memory.uploadedBy}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-line-strong">
                      <PlayGlyph className="h-7 w-7" />
                    </span>
                  )}
                  {memory.kind === "video" ? (
                    <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-md bg-ink/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                      <PlayGlyph className="h-2.5 w-2.5" />
                      {memory.durationLabel ?? "Video"}
                    </span>
                  ) : null}
                </button>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-line-strong p-1 text-center">
                  <span className="text-[10px] font-bold text-muted">
                    {memory.processingStatus === "failed" ? "No preview" : "Processing…"}
                  </span>
                  {canDelete(memory) ? (
                    <button
                      type="button"
                      onClick={() => remove(memory)}
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

      {lightboxMemory ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <span className="label min-w-0 truncate text-white/60">
              {lightboxMemory.uploadedBy}
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
            {lightboxMemory.kind === "video" ? (
              <video
                key={lightboxMemory.id}
                src={`/api/memories/${lightboxMemory.id}/view`}
                poster={
                  lightboxMemory.thumbnailUrl
                    ? `/api/memories/${lightboxMemory.id}/view?variant=poster`
                    : undefined
                }
                controls
                playsInline
                preload="metadata"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/memories/${lightboxMemory.id}/view`}
                alt={`Added by ${lightboxMemory.uploadedBy}`}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2 p-3 safe-bottom">
            {canShareFiles && lightboxMemory.shareable ? (
              <button
                type="button"
                onClick={() => share(lightboxMemory)}
                disabled={isSharing}
                className="tap w-full rounded-xl bg-white px-4 py-3 text-center text-xs font-extrabold tracking-tight text-ink transition-opacity disabled:opacity-60"
              >
                {isSharing
                  ? "Preparing…"
                  : lightboxMemory.kind === "video"
                    ? "Share video"
                    : "Share photo"}
              </button>
            ) : null}
            {lightboxMemory.kind === "image" ? (
              <a
                href={`/api/memories/${lightboxMemory.id}/download?variant=display`}
                className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
              >
                Download optimized
              </a>
            ) : null}
            <a
              href={`/api/memories/${lightboxMemory.id}/download?variant=original`}
              className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
            >
              {lightboxMemory.kind === "video" ? "Download video" : "Download original"}
            </a>
            {canDelete(lightboxMemory) ? (
              confirmingId === lightboxMemory.id ? (
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={() => remove(lightboxMemory)}
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
                  onClick={() => setConfirmingId(lightboxMemory.id)}
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

function PlayGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

const subscribeNever = () => () => {};

/**
 * PUT straight to the bucket. `fetch` can't report upload progress and a video
 * takes long enough that a silent spinner reads as broken, so this goes
 * through XHR for the one thing XHR still does better.
 */
function putToBucket(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", contentType);
    if (onProgress) {
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = () => resolve(false);
    request.onabort = () => resolve(false);
    request.send(body);
  });
}

type ProbedVideo = {
  width?: number;
  height?: number;
  durationSeconds?: number;
  poster: Blob | null;
};

/**
 * Read a clip's dimensions and length, and grab a frame to stand in for it.
 *
 * Doing this here rather than on the server keeps ffmpeg out of the deploy
 * entirely — the browser already has a decoder for anything it can play. When
 * it can't (an HEVC .mov opened in Chrome, say) this gives back what it could
 * read and no poster; the clip still uploads and still plays where it can.
 */
async function probeVideo(file: File): Promise<ProbedVideo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await once(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : undefined;
    const width = video.videoWidth || undefined;
    const height = video.videoHeight || undefined;

    let poster: Blob | null = null;
    if (width && height) {
      // A shade into the clip: the very first frame is often the lens still
      // settling, or plain black. Never 0 — seeking to where the playhead
      // already sits fires no `seeked` event and would just time out.
      video.currentTime = Math.max(0.05, duration ? Math.min(duration / 2, 0.5) : 0.1);
      try {
        await once(video, "seeked");
        poster = await drawPoster(video, width, height);
      } catch {
        poster = null; // no decoded frame available; the clip is still fine
      }
    }

    return { width, height, durationSeconds: duration, poster };
  } catch {
    return { poster: null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function drawPoster(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<Blob | null> {
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", POSTER_QUALITY);
  });
}

/** Resolve on the next `event`, or reject if the video stalls or errors. */
function once(video: HTMLVideoElement, event: "loadedmetadata" | "seeked"): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
      clearTimeout(timer);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`video ${event} failed`));
    };
    const timer = setTimeout(onError, 10_000);
    video.addEventListener(event, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

/**
 * Can this browser hand a file to the OS share sheet? Sharing the *file* is
 * what puts the memory into WhatsApp or Messages — a link to this app would be
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
  if (ext === "mov") return "video/quicktime";
  if (ext === "mp4") return "video/mp4";
  if (ext === "m4v") return "video/x-m4v";
  if (ext === "webm") return "video/webm";
  if (ext === "3gp") return "video/3gpp";
  return "image/jpeg";
}
