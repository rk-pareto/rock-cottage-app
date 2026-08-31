"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteFeedPost, dismissFeedPost } from "@/app/(app)/actions";
import { useToast } from "@/components/ui/Toast";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { CloseGlyph, PlayGlyph } from "@/components/ui/icons";
import { relativeTime } from "@/lib/time";

export type FeedPostData = {
  id: string;
  body: string | null;
  author: string;
  authorMemberId: string;
  createdAt: string;
  media: {
    kind: "image" | "video";
    thumbnailUrl: string | null;
    ready: boolean;
  } | null;
};

/** How far a swipe has to travel before it commits to a dismiss, rather than
 *  springing back — enough to be deliberate, not so far it feels stuck. */
const DISMISS_THRESHOLD_PX = 90;

/**
 * One message pinned to the top of the feed. Swipe it aside, or tap the ×
 * — both do the same thing: it's gone from *this* member's feed, and only
 * this member's. The author (or an admin) also gets a plain-text "Remove for
 * everyone", which is the only way it leaves anyone else's.
 */
export function FeedPostCard({
  post,
  canDeleteForEveryone,
  onRemoved,
}: {
  post: FeedPostData;
  canDeleteForEveryone: boolean;
  onRemoved: (postId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dragStart = useRef<number | null>(null);

  async function commitDismiss() {
    setLeaving(true);
    onRemoved(post.id); // optimistic — gone from this member's list immediately
    const result = await dismissFeedPost(post.id);
    if (!result.ok) toast(result.error, "error");
    else router.refresh();
  }

  async function commitDelete() {
    setLeaving(true);
    onRemoved(post.id);
    const result = await deleteFeedPost(post.id);
    if (!result.ok) toast(result.error, "error");
    else router.refresh();
  }

  function onPointerDown(event: React.PointerEvent) {
    if (leaving) return;
    dragStart.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (dragStart.current === null) return;
    setDragX(event.clientX - dragStart.current);
  }

  function onPointerUp() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    setDragging(false);
    if (Math.abs(dragX) > DISMISS_THRESHOLD_PX) {
      void commitDismiss();
    } else {
      setDragX(0);
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_1px_rgba(14,18,22,0.03)] transition-[opacity,transform] duration-200"
      style={{
        opacity: leaving ? 0 : Math.max(0, 1 - Math.abs(dragX) / 240),
        transform: `translateX(${leaving ? (dragX >= 0 ? 400 : -400) : dragX}px)`,
        transition: dragging ? "none" : undefined,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="touch-pan-y border-l-[3px] border-ink p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="label text-muted">
            {post.author} ·{" "}
            <RelativeTime iso={post.createdAt} initial={relativeTime(new Date(post.createdAt))} />
          </p>
          <button
            type="button"
            onClick={() => void commitDismiss()}
            aria-label="Dismiss"
            className="tap -m-1.5 shrink-0 rounded-full p-1.5 text-muted transition-colors active:bg-subtle"
          >
            <CloseGlyph className="h-4 w-4" />
          </button>
        </div>

        {post.body ? (
          <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">
            {post.body}
          </p>
        ) : null}

        {post.media ? (
          <div className="relative mt-3 aspect-[4/3] w-full max-w-xs overflow-hidden rounded-xl bg-subtle">
            {post.media.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.media.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-bold text-muted">
                {post.media.ready ? "No preview" : "Processing…"}
              </span>
            )}
            {post.media.kind === "video" && post.media.thumbnailUrl ? (
              <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur-sm">
                <PlayGlyph className="h-3 w-3" />
              </span>
            ) : null}
          </div>
        ) : null}

        {canDeleteForEveryone ? (
          <button
            type="button"
            onClick={() => void commitDelete()}
            className="tap mt-3 text-xs font-bold text-muted underline decoration-line-strong underline-offset-2 transition-colors active:text-clay"
          >
            Remove for everyone
          </button>
        ) : null}
      </div>
    </section>
  );
}
