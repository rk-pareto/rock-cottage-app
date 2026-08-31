"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createFeedPost } from "@/app/(app)/actions";
import { useToast } from "@/components/ui/Toast";
import { uploadMedia } from "@/lib/uploads/browser";

type UploadState = "idle" | "uploading" | "processing" | "done" | "failed";

/**
 * The "+" at the top of Home that opens a small composer: text, and
 * optionally one photo or video, pinned above everyone's feed the moment it
 * posts. An attachment runs through the exact upload pipeline `/memories`
 * uses (see `lib/uploads/browser`), so it's a real, ordinary memory before
 * the post itself is even submitted — nothing extra makes it show up there.
 */
export function FeedComposer({ storageReady }: { storageReady: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [mediaId, setMediaId] = useState<string | null>(null);

  function reset() {
    setBody("");
    setAttachmentName(null);
    setUploadState("idle");
    setUploadProgress(undefined);
    setMediaId(null);
  }

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be re-picked
    if (!file) return;

    setAttachmentName(file.name);
    setMediaId(null);
    setUploadState("uploading");
    const result = await uploadMedia(file, (patch) => {
      setUploadState(patch.stage);
      setUploadProgress(patch.progress);
    });
    if (result.ok) setMediaId(result.memoryId);
  }

  function removeAttachment() {
    setAttachmentName(null);
    setUploadState("idle");
    setUploadProgress(undefined);
    setMediaId(null);
  }

  const busy = uploadState === "uploading" || uploadState === "processing";
  const canSubmit = !posting && !busy && (body.trim().length > 0 || Boolean(mediaId));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setPosting(true);
    const result = await createFeedPost(body.trim() || null, mediaId);
    setPosting(false);

    if (result.ok) {
      reset();
      setOpen(false);
      toast("Posted");
      router.refresh();
    } else {
      toast(result.error, "error");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm font-bold text-muted transition-colors active:bg-subtle"
      >
        <span aria-hidden="true" className="text-lg leading-none">+</span>
        Share something with everyone
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-line bg-card p-4 shadow-[0_1px_1px_rgba(14,18,22,0.03)]"
    >
      <label htmlFor="feed-post-body" className="sr-only">
        Write a message
      </label>
      <textarea
        id="feed-post-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's up?"
        rows={3}
        maxLength={2000}
        autoFocus
        className="tap w-full resize-none rounded-xl border border-line bg-card px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,.heic,.heif,.mov,.m4v"
        onChange={onFileChosen}
        className="hidden"
      />

      {attachmentName ? (
        <div className="relative mt-2 flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-subtle px-3 py-2.5 text-sm">
          {uploadState === "uploading" && uploadProgress !== undefined ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-line transition-[width] duration-200"
              style={{ width: `${Math.round(uploadProgress * 100)}%` }}
            />
          ) : null}
          <span className="relative min-w-0 flex-1 truncate text-ink">{attachmentName}</span>
          <span
            className={`label relative shrink-0 ${uploadState === "failed" ? "text-clay" : "text-muted"}`}
          >
            {uploadState === "uploading"
              ? uploadProgress !== undefined
                ? `${Math.round(uploadProgress * 100)}%`
                : "Uploading…"
              : uploadState === "processing"
                ? "Processing…"
                : uploadState === "done"
                  ? "Ready"
                  : "Failed"}
          </span>
          <button
            type="button"
            onClick={removeAttachment}
            className="tap relative shrink-0 text-xs font-bold text-muted"
          >
            Remove
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!storageReady || busy}
          onClick={() => fileInput.current?.click()}
          className="tap rounded-xl border border-line-strong px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-ink-soft transition-colors active:bg-subtle disabled:opacity-30"
        >
          Photo / video
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="tap flex-1 rounded-xl bg-ink px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.98] disabled:opacity-30"
        >
          {posting ? "Posting…" : "Post"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={posting}
          className="tap rounded-xl px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-ink-soft transition-colors active:bg-subtle disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
