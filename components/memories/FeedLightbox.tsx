"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronGlyph } from "@/components/ui/icons";

export type FeedLightboxItem = {
  id: string;
  kind: "image" | "video";
  uploadedBy: string;
  thumbnailUrl: string | null;
};

/** Below this drag distance, a touch is a tap or an aborted swipe, not a page turn. */
const SWIPE_THRESHOLD_PX = 50;

const FeedLightboxContext = createContext<((id: string) => void) | null>(null);

/** Lets any photo tile in the feed open the shared viewer without each tile
 *  needing to know about its neighbors. */
export function useFeedLightbox(): (id: string) => void {
  const open = useContext(FeedLightboxContext);
  if (!open) {
    throw new Error("useFeedLightbox must be used within a FeedLightboxProvider");
  }
  return open;
}

/**
 * Wraps the home feed so any photo tile inside it can open a fullscreen,
 * swipeable viewer over the *whole* set of memories passed in — not just
 * itself. One dialog shared by every tile, rather than each carrying its own.
 *
 * Deliberately lighter than the gallery's lightbox (`/memories`): no
 * favorite, share, or delete here, since home only has the thumbnail-level
 * data for its random draw. "Open in Memories" is the door to those.
 */
export function FeedLightboxProvider({
  items,
  children,
}: {
  items: FeedLightboxItem[];
  children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Live drag offset while a finger is down, so the photo tracks it before a
  // swipe commits or springs back.
  const [dragX, setDragX] = useState(0);
  const [isTouching, setIsTouching] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const index = items.findIndex((m) => m.id === openId);
  const memory = index >= 0 ? items[index] : null;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < items.length - 1;

  function goPrev() {
    if (index > 0) setOpenId(items[index - 1].id);
  }
  function goNext() {
    if (hasNext) setOpenId(items[index + 1].id);
  }

  // Arrow keys mirror the swipe for anyone on a trackpad or keyboard.
  useEffect(() => {
    if (!memory) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
      else if (event.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // goPrev/goNext close over `index` fresh every render, so they're
    // deliberately left out here — re-subscribing this cheap a listener on
    // every render is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory]);

  function onTouchStart(event: React.TouchEvent) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    setIsTouching(true);
  }

  function onTouchMove(event: React.TouchEvent) {
    if (!touchStart.current) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    if (Math.abs(dy) > Math.abs(dx)) return; // a vertical drag isn't a page turn
    // Rubber-band at the ends of the list instead of dragging past them.
    const pastEnd = (dx < 0 && !hasNext) || (dx > 0 && !hasPrev);
    setDragX(pastEnd ? dx / 3 : dx);
  }

  function onTouchEnd() {
    const dx = dragX;
    touchStart.current = null;
    setIsTouching(false);
    setDragX(0);
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  return (
    <FeedLightboxContext.Provider value={setOpenId}>
      {children}

      {memory ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <span className="label min-w-0 truncate text-white/60">{memory.uploadedBy}</span>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="tap rounded-lg px-3 py-2 text-xs font-extrabold text-white/80 transition-colors hover:text-white"
            >
              Close
            </button>
          </div>

          <div
            className={`relative flex flex-1 items-center justify-center overflow-hidden p-2 ${
              memory.kind === "image" ? "touch-none" : ""
            }`}
            // A video has its own left-right gesture — scrubbing — so only a
            // photo hands its touches to the swipe.
            onTouchStart={memory.kind === "image" ? onTouchStart : undefined}
            onTouchMove={memory.kind === "image" ? onTouchMove : undefined}
            onTouchEnd={memory.kind === "image" ? onTouchEnd : undefined}
          >
            <div
              style={{
                transform: `translateX(${dragX}px)`,
                transition: isTouching ? "none" : "transform 200ms ease",
              }}
              className="flex h-full w-full items-center justify-center"
            >
              {memory.kind === "video" ? (
                <video
                  key={memory.id}
                  src={`/api/memories/${memory.id}/view`}
                  poster={
                    memory.thumbnailUrl
                      ? `/api/memories/${memory.id}/view?variant=poster`
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
                  src={`/api/memories/${memory.id}/view`}
                  alt={`Added by ${memory.uploadedBy}`}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              )}
            </div>

            {hasPrev ? (
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous"
                className="tap absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/50 text-white backdrop-blur-sm transition-colors hover:bg-ink/70"
              >
                <ChevronGlyph className="h-5 w-5" />
              </button>
            ) : null}
            {hasNext ? (
              <button
                type="button"
                onClick={goNext}
                aria-label="Next"
                className="tap absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/50 text-white backdrop-blur-sm transition-colors hover:bg-ink/70"
              >
                <ChevronGlyph className="h-5 w-5 rotate-180" />
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 p-3 safe-bottom">
            <Link
              href="/memories"
              className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
            >
              Open in Memories
            </Link>
          </div>
        </div>
      ) : null}
    </FeedLightboxContext.Provider>
  );
}
