"use client";

/**
 * Browser-only helpers for the memory upload flow (spec §14.5), shared by
 * `/memories`' full uploader and the feed post composer's single-attachment
 * one. No server code here — this is the part that has to run on the phone:
 * reading a video's dimensions, drawing its poster frame, and PUTting bytes
 * straight to the bucket with a real progress bar.
 */

/** The poster frame is only ever a thumbnail source, so it stays small. */
const POSTER_MAX_EDGE = 1280;
const POSTER_QUALITY = 0.85;

/**
 * How long a PUT may go without a single byte moving before it is given up on.
 *
 * Not a total timeout: a large clip on cottage wifi legitimately takes many
 * minutes, and cutting it off at any fixed duration would break the uploads
 * that need the most patience. What is never legitimate is *silence* — a phone
 * that walked out of signal leaves an XHR that will sit there forever without
 * firing error, load or abort.
 */
const STALL_TIMEOUT_MS = 45_000;

/**
 * And how long the bucket then gets to acknowledge it. The last byte leaving
 * the phone is not the end of the request: a large object still has to be
 * written before the 200 comes back, and no progress events are fired while
 * that happens. Generous, because cutting off an upload that actually arrived
 * is the one outcome worse than waiting.
 */
const RESPONSE_TIMEOUT_MS = 120_000;

/**
 * PUT straight to the bucket. `fetch` can't report upload progress and a video
 * takes long enough that a silent spinner reads as broken, so this goes
 * through XHR for the one thing XHR still does better.
 *
 * Resolves false rather than hanging when the transfer stalls. That matters
 * beyond this one file: the Memories uploader awaits these in sequence, so an
 * XHR that never settles doesn't just lose its own photo, it strands every
 * file queued behind it — they never even reach the intent step.
 */
export function putToBucket(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", contentType);

    let watchdog: ReturnType<typeof setTimeout>;
    const armWatchdog = (ms: number) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => request.abort(), ms);
    };
    const settle = (ok: boolean) => {
      clearTimeout(watchdog);
      resolve(ok);
    };

    request.upload.onprogress = (event) => {
      armWatchdog(STALL_TIMEOUT_MS);
      if (onProgress && event.lengthComputable) onProgress(event.loaded / event.total);
    };
    // Every byte is out; the clock is now the bucket's, not the radio's.
    request.upload.onload = () => armWatchdog(RESPONSE_TIMEOUT_MS);
    request.onload = () => settle(request.status >= 200 && request.status < 300);
    request.onerror = () => settle(false);
    request.onabort = () => settle(false);

    armWatchdog(STALL_TIMEOUT_MS);
    request.send(body);
  });
}

export type ProbedVideo = {
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
export async function probeVideo(file: File): Promise<ProbedVideo> {
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

export function guessContentType(filename: string): string {
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

/**
 * Can this browser hand a file to the OS share sheet? Sharing the *file* is
 * what puts the memory into WhatsApp or Messages — a link to this app would be
 * useless outside the family. Most desktop browsers can't, so the button is
 * hidden there. The answer can't change for the life of the page, so it is
 * asked once.
 */
let fileSharingSupport: boolean | undefined;
export function supportsFileSharing(): boolean {
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

export type UploadResult =
  | { ok: true; memoryId: string }
  /** `memoryId` is present whenever the intent got as far as making a row —
   *  hand it back to `retryOfMemoryId` so a retry re-uses it. */
  | { ok: false; message: string; memoryId?: string };

/**
 * Upload one file end to end: intent → direct PUT (→ poster) → complete.
 * Shared by the Memories screen's multi-file uploader and the feed post
 * composer's single-attachment one, so both go through exactly one path from
 * a chosen `File` to a `ready` (or `failed`) `media` row.
 *
 * Every step here can fail on a phone halfway up a hill — most often the PUT
 * itself, which is minutes of radio for a large clip — so failure is never
 * terminal: the caller keeps the `File` and calls this again, passing
 * `retryOfMemoryId` so the abandoned row is re-used rather than piling up.
 */
export async function uploadMedia(
  file: File,
  onProgress?: (patch: { stage: "uploading" | "processing" | "done" | "failed"; progress?: number; message?: string }) => void,
  retryOfMemoryId?: string,
): Promise<UploadResult> {
  try {
    const contentType = file.type || guessContentType(file.name);
    const isVideo = contentType.startsWith("video/");

    const probed = isVideo ? await probeVideo(file) : null;

    const intentResponse = await fetch("/api/memories/upload-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType,
        bytes: file.size,
        width: probed?.width,
        height: probed?.height,
        durationSeconds: probed?.durationSeconds,
        hasPoster: Boolean(probed?.poster),
        retryOfMemoryId,
      }),
    });

    if (!intentResponse.ok) {
      // The row this retry meant to re-use is gone or already finished (409).
      // The file in hand is still perfectly uploadable, so start it clean
      // rather than leaving the retry button permanently broken.
      if (retryOfMemoryId && intentResponse.status === 409) {
        return uploadMedia(file, onProgress);
      }
      const body = await intentResponse.json().catch(() => ({}));
      const message = body.error ?? "Upload couldn't start.";
      onProgress?.({ stage: "failed", message });
      return { ok: false, message };
    }

    const { memoryId, uploadUrl, posterUploadUrl } = (await intentResponse.json()) as {
      memoryId: string;
      uploadUrl: string;
      posterUploadUrl: string | null;
    };

    const uploaded = await putToBucket(uploadUrl, file, contentType, (progress) =>
      onProgress?.({ stage: "uploading", progress }),
    );
    if (!uploaded) {
      const message = "The upload didn't finish.";
      onProgress?.({ stage: "failed", message });
      return { ok: false, message, memoryId };
    }

    // Best effort: a clip with no poster still plays, it just shows a
    // placeholder tile in the grid.
    if (posterUploadUrl && probed?.poster) {
      await putToBucket(posterUploadUrl, probed.poster, "image/jpeg");
    }

    onProgress?.({ stage: "processing", progress: undefined });
    const completeResponse = await fetch(`/api/memories/${memoryId}/complete`, { method: "POST" });
    const completeBody = (await completeResponse.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
    };

    if (completeBody.status === "ready") {
      onProgress?.({ stage: "done" });
      return { ok: true, memoryId };
    }

    const message = completeBody.error ?? "Preview couldn't be created.";
    onProgress?.({ stage: "failed", message });
    return { ok: false, message, memoryId };
  } catch {
    const message = "Something went wrong. Try again.";
    onProgress?.({ stage: "failed", message });
    return { ok: false, message };
  }
}

/**
 * Attach a photo to a shopping item: intent → direct PUT → compress.
 *
 * Deliberately *not* {@link uploadMedia}. That pipeline creates a `media` row,
 * which is what puts a file in Memories and keeps its original forever — and
 * a snapshot of the right brand of coffee is neither a memory nor something
 * anyone wants at full resolution. This one leaves nothing behind but the
 * compressed copy the list shows.
 */
export async function uploadShoppingPhoto(
  itemId: string,
  file: File,
  onProgress?: (patch: { stage: "uploading" | "processing"; progress?: number }) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const contentType = file.type || guessContentType(file.name);

    const intentResponse = await fetch(`/api/shopping/${itemId}/photo-intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType, bytes: file.size }),
    });

    if (!intentResponse.ok) {
      const body = await intentResponse.json().catch(() => ({}));
      return { ok: false, message: body.error ?? "That photo couldn't be uploaded." };
    }

    const { uploadUrl } = (await intentResponse.json()) as { uploadUrl: string };

    const uploaded = await putToBucket(uploadUrl, file, contentType, (progress) =>
      onProgress?.({ stage: "uploading", progress }),
    );
    if (!uploaded) return { ok: false, message: "The upload didn't finish." };

    onProgress?.({ stage: "processing" });
    const completeResponse = await fetch(`/api/shopping/${itemId}/photo`, { method: "POST" });
    if (!completeResponse.ok) {
      const body = await completeResponse.json().catch(() => ({}));
      return { ok: false, message: body.error ?? "That photo couldn't be saved." };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: "Something went wrong. Try again." };
  }
}
