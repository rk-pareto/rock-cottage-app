"use client";

import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { deleteMemory, toggleFavorite } from "./actions";
import { HeartGlyph, PlayGlyph } from "@/components/ui/icons";
import { Lightbox } from "@/components/memories/Lightbox";
import { supportsFileSharing, uploadMedia } from "@/lib/uploads/browser";

export type MemoryCardData = {
  id: string;
  kind: "image" | "video";
  originalFilename: string;
  uploadedBy: string;
  uploadedByMemberId: string;
  processingStatus: string;
  thumbnailUrl: string | null;
  /** Presigned full-size copy, so the viewer loads straight from the bucket. */
  displayUrl: string | null;
  durationLabel: string | null;
  /** False for clips too large to hand to the OS share sheet in one piece. */
  shareable: boolean;
  /** Whether a transcoded MP4 exists: false on an image, on a clip that was
   *  already an ordinary MP4, and until the pass lands. Decides both the
   *  optimized download and what `/share` will name its bytes. */
  hasPlaybackCopy: boolean;
  createdAt: string;
  /** Whether the *current* member has favorited this memory — never other
   *  members' favorites, which stay private to them. */
  favorited: boolean;
};

type UploadState = {
  key: string;
  name: string;
  stage: "uploading" | "processing" | "done" | "failed";
  /** 0–1 while the bytes are moving; a long video needs a real bar. */
  progress?: number;
  message?: string;
  /** Kept for the whole life of the row so a failure can be retried without
   *  making anyone find the photo in their camera roll a second time. */
  file: File;
  /** The row the attempt created, so a retry lands on it instead of leaving a
   *  stranded "Processing…" tile behind. Absent if it never got that far. */
  memoryId?: string;
};

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
  const [tab, setTab] = useState<"all" | "favorites">("all");
  // Optimistic per-memory overrides, keyed by id. Falls back to the server's
  // `favorited` once a memory has no override — never guessed at.
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const sharePrefetch = useRef<{ id: string; file: Promise<File> } | null>(null);
  // False during SSR, so the button appears only once hydration has asked the
  // browser — no markup mismatch.
  const canShareFiles = useSyncExternalStore(subscribeNever, supportsFileSharing, () => false);

  const patch = useCallback((key: string, changes: Partial<UploadState>) => {
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...changes } : u)));
  }, []);

  /** Upload one file end to end: intent → direct PUT (→ poster) → complete. */
  const uploadOne = useCallback(
    async (file: File, key: string, retryOfMemoryId?: string) => {
      const result = await uploadMedia(file, (progress) => patch(key, progress), retryOfMemoryId);
      // Remember the row either way: on a failure it is what the retry re-uses.
      if (result.memoryId) patch(key, { memoryId: result.memoryId });
      router.refresh();
    },
    [router, patch],
  );

  /** Try a failed upload again with the file still in hand. */
  const retryUpload = useCallback(
    (upload: UploadState) => {
      patch(upload.key, { stage: "uploading", progress: undefined, message: undefined });
      void uploadOne(upload.file, upload.key, upload.memoryId);
    },
    [patch, uploadOne],
  );

  const dismissUpload = useCallback((key: string) => {
    setUploads((current) => current.filter((u) => u.key !== key));
  }, []);

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
      // Photos always come back re-encoded as JPEG. A clip comes back as its
      // playback MP4 wherever one exists, and only otherwise as it was
      // recorded — so a .mov original must still be handed to the share sheet
      // as .mp4, or the OS is told the wrong thing about the bytes inside.
      const name =
        memory.kind === "video"
          ? memory.hasPlaybackCopy
            ? `${base}.mp4`
            : `${base}${memory.originalFilename.match(/\.[^.]+$/)?.[0] ?? ".mp4"}`
          : `${base}.jpg`;
      return new File([blob], name, { type: blob.type || "application/octet-stream" });
    });
    void file.catch(() => {}); // a prefetch nobody shares must not go unhandled
    sharePrefetch.current = { id: memory.id, file };
    return file;
  }, []);

  function showMemory(memory: MemoryCardData) {
    setLightboxId(memory.id);
    setConfirmingId(null);
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
        file,
      })),
    ]);

    // Sequential: kinder to phone radios and to the server's image workers.
    for (const { file, key } of entries) {
      await uploadOne(file, key);
    }
  }

  const isFavorited = useCallback(
    (memory: MemoryCardData) => favoriteOverrides[memory.id] ?? memory.favorited,
    [favoriteOverrides],
  );

  async function toggleFav(memory: MemoryCardData) {
    const next = !isFavorited(memory);
    setFavoriteOverrides((current) => ({ ...current, [memory.id]: next }));
    const result = await toggleFavorite(memory.id);
    if (!result.ok) {
      setFavoriteOverrides((current) => ({ ...current, [memory.id]: !next }));
      toast(result.error, "error");
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
  const canDelete = (memory: MemoryCardData) =>
    memory.uploadedByMemberId === currentMemberId || isAdmin;
  const visibleMemories = tab === "favorites" ? memories.filter(isFavorited) : memories;
  // Swiping walks whatever's currently on screen, so it stays in step with
  // the All/Favorites tab rather than jumping into memories the grid hid.
  const lightboxIndex = visibleMemories.findIndex((m) => m.id === lightboxId);
  const lightboxMemory = lightboxIndex >= 0 ? visibleMemories[lightboxIndex] : null;

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
              {/* A failed upload is nearly always a phone that lost signal
                  mid-PUT, and the file is still right here — so the fix is one
                  tap, not another trip through the camera roll. */}
              {upload.stage === "failed" ? (
                <span className="relative flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => retryUpload(upload)}
                    className="tap rounded-lg bg-ink px-2.5 py-1 text-xs font-extrabold tracking-tight text-paper transition active:scale-95"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissUpload(upload.key)}
                    aria-label={`Dismiss ${upload.name}`}
                    className="tap px-1 text-xs font-bold text-muted"
                  >
                    ✕
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {memories.length > 0 ? (
        <div className="mb-4 inline-flex rounded-full border border-line bg-subtle p-1">
          {(["all", "favorites"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`label rounded-full px-3.5 py-1.5 transition-colors ${
                tab === value ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              {value === "all" ? "All" : "Favorites"}
            </button>
          ))}
        </div>
      ) : null}

      {visibleMemories.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center text-sm text-muted">
          {tab === "favorites"
            ? "No favorites yet. Tap the heart on a photo or video to save it here."
            : "Nothing here yet. Someone go take a picture of the lake."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1">
          {visibleMemories.map((memory) => (
            <li key={memory.id} className="relative aspect-square">
              {/* A clip whose poster never made it is still openable once its
                  bytes have landed — it just has no still to show. */}
              {memory.thumbnailUrl ||
              (memory.kind === "video" && memory.processingStatus === "ready") ? (
                <>
                  <button
                    type="button"
                    onClick={() => showMemory(memory)}
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
                  <button
                    type="button"
                    onClick={() => toggleFav(memory)}
                    aria-label={isFavorited(memory) ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={isFavorited(memory)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/50 text-white backdrop-blur-sm transition-transform active:scale-90"
                  >
                    <HeartGlyph filled={isFavorited(memory)} className="h-3.5 w-3.5" />
                  </button>
                </>
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
        <Lightbox
          items={visibleMemories}
          index={lightboxIndex}
          title={lightboxMemory.uploadedBy}
          onIndexChange={(next) => showMemory(visibleMemories[next])}
          onClose={() => setLightboxId(null)}
          actions={
            <button
              type="button"
              onClick={() => toggleFav(lightboxMemory)}
              aria-label={
                isFavorited(lightboxMemory) ? "Remove from favorites" : "Add to favorites"
              }
              aria-pressed={isFavorited(lightboxMemory)}
              className="tap rounded-lg p-2 text-white/80 transition-colors hover:text-white"
            >
              <HeartGlyph filled={isFavorited(lightboxMemory)} className="h-5 w-5" />
            </button>
          }
          footer={
            <>
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
            {/* Only offered where there is a second copy to fetch: every
                image has its display copy, but a clip only has a playback MP4
                if it needed one and the pass has landed. Otherwise
                `?variant=playback` is a 404 behind a button. */}
            {lightboxMemory.kind === "image" || lightboxMemory.hasPlaybackCopy ? (
              <a
                href={`/api/memories/${lightboxMemory.id}/download?variant=${
                  lightboxMemory.kind === "video" ? "playback" : "display"
                }`}
                className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
              >
                Download optimized
              </a>
            ) : null}
            {/* On its own this is simply "the video"; beside the optimized
                copy it has to say which of the two it hands over. */}
            <a
              href={`/api/memories/${lightboxMemory.id}/download?variant=original`}
              className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
            >
              {lightboxMemory.kind === "video" && !lightboxMemory.hasPlaybackCopy
                ? "Download video"
                : "Download original"}
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
            </>
          }
        />
      ) : null}
    </>
  );
}


const subscribeNever = () => () => {};
