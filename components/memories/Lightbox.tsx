"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronGlyph, MutedGlyph, PlayGlyph } from "@/components/ui/icons";

export type LightboxItem = {
  id: string;
  kind: "image" | "video";
  uploadedBy: string;
  thumbnailUrl: string | null;
};

/* The conveyor: neighbors are real, already-mounted panels on a sliding
 * track, so a swipe carries the finger onto the next photo instead of
 * animating the old one back and popping the new one in. Panels are keyed by
 * memory id and kept alive two steps out in each direction, so swiping back
 * lands on an image that's still decoded — no refetch, no broken-image flash.
 */

/** How far past the finger's release a drag must have gone to turn the page. */
const COMMIT_PX = 70;
/** A flick this fast (px/ms) turns the page even from a short drag. */
const FLICK_VELOCITY = 0.45;
/** Downward drag distance that lets go of the viewer entirely. */
const DISMISS_PX = 110;
const DISMISS_VELOCITY = 0.55;
/** Full dismiss-fade is reached at this drag depth. */
const DISMISS_RANGE_PX = 360;

const SLIDE_MS = 320;
/** iOS-style settle: fast out of the gate, long soft landing. */
const SLIDE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT_MS = 240;

/** Panels kept mounted on each side of the current one. */
const WINDOW = 2;

type Axis = "x" | "y" | null;

export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
  title,
  actions,
  footer,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Top-left caption — who added the current memory. */
  title: string;
  /** Extra top-bar buttons, rendered before Close. */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const current = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const [drag, setDrag] = useState<{ x: number; y: number; axis: Axis }>({
    x: 0,
    y: 0,
    axis: null,
  });
  const [touching, setTouching] = useState(false);
  /** Which neighbor the track is animating toward; 0 is a spring-back. */
  const [settle, setSettle] = useState<-1 | 0 | 1 | null>(null);
  const [dismissing, setDismissing] = useState(false);
  // A video only takes over the touch surface once someone taps it — until
  // then it's something the pager swipes past like any photo, whether or not
  // it happens to be autoplaying. Cleared on every page turn, so swiping back
  // lands on a clip the pager still owns.
  const [controlledId, setControlledId] = useState<string | null>(null);

  const gesture = useRef<{
    startX: number;
    startY: number;
    axis: Axis;
    samples: { t: number; x: number; y: number }[];
  } | null>(null);
  // Mirrors `settle` so transitionend and its timeout fallback can each tell
  // whether the other already finished the move.
  const settleRef = useRef<-1 | 0 | 1 | null>(null);
  const settleTimer = useRef<number | null>(null);

  const windowStart = Math.max(0, index - WINDOW);
  const windowItems = items.slice(windowStart, Math.min(items.length, index + WINDOW + 1));
  // Which panel the track is heading for. `index` doesn't move until the slide
  // lands, so without this a clip only starts loading once it has already
  // arrived — the pause everyone reads as a stutter.
  const arrivingIndex = settle !== null ? index + settle : index;

  function finishSettle() {
    if (settleRef.current === null) return;
    const to = settleRef.current;
    settleRef.current = null;
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    // Batched with the parent's index change, so the track resets to center
    // in the same paint that shifts every panel one slot over — the photo
    // never visibly moves.
    setSettle(null);
    setDrag({ x: 0, y: 0, axis: null });
    if (to !== 0) {
      setControlledId(null);
      onIndexChange(index + to);
    }
  }

  function beginSettle(to: -1 | 0 | 1) {
    if (settleRef.current !== null || dismissing) return;
    if (to === 1 && !hasNext) return;
    if (to === -1 && !hasPrev) return;
    // A release with no travel has no transition to end — skip straight past.
    if (to === 0 && drag.x === 0) {
      setDrag({ x: 0, y: 0, axis: null });
      return;
    }
    settleRef.current = to;
    setSettle(to);
    // transitionend goes missing if the tab is hidden mid-slide.
    settleTimer.current = window.setTimeout(finishSettle, SLIDE_MS + 120);
  }

  function beginDismiss() {
    if (dismissing) return;
    setDismissing(true);
    setTouching(false);
    window.setTimeout(onClose, EXIT_MS);
  }

  // Arrow keys mirror the swipe for anyone on a trackpad or keyboard.
  // Re-attached every render on purpose: the handlers must close over fresh
  // state, and a listener this cheap isn't worth memoizing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (dismissing) return;
      if (event.key === "ArrowLeft") beginSettle(-1);
      else if (event.key === "ArrowRight") beginSettle(1);
      else if (event.key === "Escape") beginDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, []);

  function onTouchStart(event: React.TouchEvent) {
    if (event.touches.length !== 1 || settleRef.current !== null || dismissing) return;
    const touch = event.touches[0];
    gesture.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      axis: null,
      samples: [{ t: performance.now(), x: touch.clientX, y: touch.clientY }],
    };
    setTouching(true);
  }

  function onTouchMove(event: React.TouchEvent) {
    const g = gesture.current;
    if (!g) return;
    const touch = event.touches[0];
    const dx = touch.clientX - g.startX;
    const dy = touch.clientY - g.startY;

    // Lock to one axis on first clear movement, so a page-turn can't wander
    // into a dismiss halfway through (or vice versa).
    if (!g.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      g.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }

    g.samples.push({ t: performance.now(), x: touch.clientX, y: touch.clientY });
    if (g.samples.length > 6) g.samples.shift();

    if (g.axis === "x") {
      // Rubber-band at the ends of the list instead of dragging past them.
      const pastEnd = (dx < 0 && !hasNext) || (dx > 0 && !hasPrev);
      setDrag({ x: pastEnd ? dx / 3 : dx, y: 0, axis: "x" });
    } else {
      // Down pulls the photo out of the viewer; up only stretches.
      setDrag({ x: 0, y: dy < 0 ? dy / 3 : dy, axis: "y" });
    }
  }

  function onTouchEnd() {
    const g = gesture.current;
    gesture.current = null;
    setTouching(false);
    if (!g || !g.axis) {
      setDrag({ x: 0, y: 0, axis: null });
      return;
    }

    // Velocity over the gesture's last ~100ms, so a slow drag that pauses
    // doesn't count as a flick.
    const last = g.samples[g.samples.length - 1];
    const past = g.samples.find((s) => last.t - s.t <= 100) ?? g.samples[0];
    const dt = Math.max(1, last.t - past.t);

    if (g.axis === "x") {
      const vx = (last.x - past.x) / dt;
      let to: -1 | 0 | 1 = 0;
      if (Math.abs(vx) > FLICK_VELOCITY && Math.abs(drag.x) > 20) to = vx < 0 ? 1 : -1;
      else if (Math.abs(drag.x) > COMMIT_PX) to = drag.x < 0 ? 1 : -1;
      if ((to === 1 && !hasNext) || (to === -1 && !hasPrev)) to = 0;
      beginSettle(to);
    } else {
      const vy = (last.y - past.y) / dt;
      if (drag.y > DISMISS_PX || (vy > DISMISS_VELOCITY && drag.y > 30)) beginDismiss();
      else setDrag({ x: 0, y: 0, axis: null }); // springs back — see panel transition
    }
  }

  // How far along the let-go-of-the-photo gesture is, 0..1. Drives the photo
  // shrinking, the backdrop lifting, and the chrome getting out of the way.
  const dismissProgress = dismissing
    ? 1
    : drag.axis === "y"
      ? Math.min(1, Math.max(0, drag.y) / DISMISS_RANGE_PX)
      : 0;

  const baseOffset = -(index - windowStart) * 100;
  const trackStyle: React.CSSProperties = {
    transform:
      settle !== null
        ? `translate3d(${baseOffset - settle * 100}%, 0, 0)`
        : `translate3d(calc(${baseOffset}% + ${drag.axis === "x" ? drag.x : 0}px), 0, 0)`,
    transition: settle !== null ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}` : "none",
    willChange: "transform",
  };

  const currentPanelStyle: React.CSSProperties = {
    transform: dismissing
      ? "translate3d(0, 52vh, 0) scale(0.8)"
      : drag.axis === "y"
        ? `translate3d(0, ${drag.y}px, 0) scale(${1 - dismissProgress * 0.12})`
        : undefined,
    opacity: dismissing ? 0 : undefined,
    transition: touching
      ? "none"
      : `transform ${EXIT_MS}ms ${SLIDE_EASE}, opacity ${EXIT_MS}ms ease`,
  };

  const backdropStyle: React.CSSProperties = {
    opacity: dismissing ? 0 : 0.97 - dismissProgress * 0.55,
    transition: touching ? "none" : `opacity ${EXIT_MS}ms ease`,
  };

  // The chrome ducks out faster than the backdrop, so mid-drag the photo
  // floats alone over the fading room.
  const chromeStyle: React.CSSProperties = {
    opacity: dismissing ? 0 : 1 - Math.min(1, dismissProgress * 1.6),
    transition: touching ? "none" : `opacity ${EXIT_MS}ms ease`,
    pointerEvents: dismissProgress > 0 ? "none" : undefined,
  };

  // Only a video someone has *taken control of* owns its touches (its scrub
  // bar is a left-right gesture too). Deliberately not "a video that's
  // playing": clips autoplay muted as they come into view, and the pager has
  // to keep sliding over those.
  const swipeable = !(current.kind === "video" && controlledId === current.id);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col [animation:lightbox-in_0.2s_ease]"
      role="dialog"
      aria-modal="true"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-ink" style={backdropStyle} />

      <div
        className="relative flex items-center justify-between gap-3 p-3 text-white"
        style={chromeStyle}
      >
        <span className="label min-w-0 truncate text-white/60">{title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={beginDismiss}
            className="tap rounded-lg px-3 py-2 text-xs font-extrabold text-white/80 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>
      </div>

      <div
        className={`relative flex-1 overflow-hidden ${swipeable ? "touch-none" : ""}`}
        onTouchStart={swipeable ? onTouchStart : undefined}
        onTouchMove={swipeable ? onTouchMove : undefined}
        onTouchEnd={swipeable ? onTouchEnd : undefined}
        onTouchCancel={swipeable ? onTouchEnd : undefined}
      >
        <div
          className="flex h-full"
          style={trackStyle}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === "transform") {
              finishSettle();
            }
          }}
        >
          {windowItems.map((item) => {
            const isCurrent = item.id === current.id;
            const slot = items.indexOf(item);
            return (
              <div key={item.id} className="h-full w-full shrink-0 p-2">
                <div className="h-full w-full" style={isCurrent ? currentPanelStyle : undefined}>
                  {item.kind === "video" ? (
                    <VideoPane
                      item={item}
                      // The panel sliding in counts as live too, so its clip
                      // has the whole slide to load and start — it arrives
                      // already playing instead of catching up afterwards.
                      // The one sliding out keeps playing until it lands.
                      active={isCurrent || slot === arrivingIndex}
                      controlled={isCurrent && controlledId === item.id}
                      onTakeControl={() => setControlledId(item.id)}
                    />
                  ) : (
                    <PhotoPane item={item} near={Math.abs(slot - index) <= 1} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {hasPrev ? (
          <button
            type="button"
            onClick={() => beginSettle(-1)}
            aria-label="Previous"
            style={chromeStyle}
            className="tap absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/50 text-white backdrop-blur-sm transition-colors hover:bg-ink/70"
          >
            <ChevronGlyph className="h-5 w-5" />
          </button>
        ) : null}
        {hasNext ? (
          <button
            type="button"
            onClick={() => beginSettle(1)}
            aria-label="Next"
            style={chromeStyle}
            className="tap absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink/50 text-white backdrop-blur-sm transition-colors hover:bg-ink/70"
          >
            <ChevronGlyph className="h-5 w-5 rotate-180" />
          </button>
        ) : null}

        {items.length > 1 ? (
          <span
            aria-hidden="true"
            style={chromeStyle}
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink/40 px-2.5 py-1 text-[10px] font-bold tabular-nums text-white/70 backdrop-blur-sm"
          >
            {index + 1} / {items.length}
          </span>
        ) : null}
      </div>

      <div className="relative flex flex-wrap gap-2 p-3 safe-bottom" style={chromeStyle}>
        {footer}
      </div>
    </div>
  );
}

/**
 * One photo on the track. The grid thumbnail everyone just tapped is already
 * in cache, so it shows instantly — blurred up to full size — while the real
 * display copy loads over it and fades in. A failed load keeps the blurred
 * still and offers a retry instead of the browser's broken-image glyph.
 */
function PhotoPane({ item, near }: { item: LightboxItem; near: boolean }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  // The blurred thumb stays under the full image until its fade-in finishes,
  // so there's never a frame of bare backdrop between the two.
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Once a panel has come within one step of the viewport it keeps its full
  // image for as long as it stays mounted — swiping back must not refetch.
  const [wantsFull, setWantsFull] = useState(near);
  if (near && !wantsFull) setWantsFull(true);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const src = wantsFull
    ? `/api/memories/${item.id}/view${attempt > 0 ? `?retry=${attempt}` : ""}`
    : null;

  // A cache hit can complete before React attaches the load listener.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setPhase("ready");
  }, [src]);

  return (
    <div className="relative h-full w-full">
      {item.thumbnailUrl && !revealed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.thumbnailUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain blur-lg brightness-90"
        />
      ) : null}

      {src && phase !== "error" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={imgRef}
          key={src}
          src={src}
          alt={`Added by ${item.uploadedBy}`}
          draggable={false}
          onLoad={() => setPhase("ready")}
          onError={() => setPhase("error")}
          onTransitionEnd={(event) => {
            if (event.propertyName === "opacity" && phase === "ready") setRevealed(true);
          }}
          className={`relative h-full w-full object-contain transition-opacity duration-300 ${
            phase === "ready" ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      {src && phase === "loading" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center [animation:spinner-in_0.2s_ease_0.4s_both]"
        >
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
        </span>
      ) : null}

      {phase === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <p className="text-xs font-bold text-white/60">This photo didn&apos;t load</p>
          <button
            type="button"
            onClick={() => {
              setPhase("loading");
              setAttempt((n) => n + 1);
            }}
            className="tap rounded-full bg-white/12 px-4 py-2 text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * `prefers-reduced-motion`, read live so a mid-session change takes effect.
 * Seeded synchronously rather than in an effect: a clip that autoplays for one
 * frame before the effect catches up is exactly what the setting rules out.
 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * Off-track a clip is just its poster still, so a run of fast swipes glides
 * over it like any photo — mounting a `<video>` per panel would spin up
 * decoders for clips nobody is watching. The real player mounts when the panel
 * becomes current and starts itself, muted; unmounting on the way out is what
 * stops it, and a clip swiped back to starts over rather than resuming.
 *
 * Muted is the whole trick: browsers hand out silent autoplay for free but
 * want a user gesture before any sound. So a tap "takes control" — it unmutes,
 * brings up the native controls, and only then does the clip own its touches
 * (see `swipeable`). Until then it's still just something the pager slides
 * past, autoplaying or not.
 */
function VideoPane({
  item,
  active,
  controlled,
  onTakeControl,
}: {
  item: LightboxItem;
  active: boolean;
  controlled: boolean;
  onTakeControl: () => void;
}) {
  const posterUrl = item.thumbnailUrl ? `/api/memories/${item.id}/view?variant=poster` : undefined;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reducedMotion = useReducedMotion();
  // A browser can still say no — data saver, low power mode, a site setting.
  // Once it has, this clip goes back to being tap-to-play.
  const [refused, setRefused] = useState(false);
  // Where the pointer went down, so a swipe that merely ends on the clip
  // isn't mistaken for a tap asking for sound.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  // Whether frames are actually coming out yet. Until they are, the poster
  // stays on top — a `<video>` showing nothing is the flash we're avoiding.
  const [rolling, setRolling] = useState(false);

  const autoplaying = active && !controlled && !refused && !reducedMotion;
  const showPlayer = active && (controlled || autoplaying);

  useEffect(() => {
    const video = videoRef.current;
    if (!showPlayer || !video) return;
    // React's `muted` prop doesn't reliably reach the DOM property, and an
    // unmuted autoplay is one every browser refuses — so set it on the element
    // itself. Taking control is the gesture that buys the sound.
    video.muted = !controlled;
    if (controlled) return;
    // play() rejects on a refusal, and again when the panel unmounts mid-load;
    // either way it has to be caught, or it surfaces as an unhandled rejection.
    // A refusal just drops back to the poster, one tap from playing.
    video.play().catch(() => setRefused(true));
  }, [controlled, showPlayer]);

  // Detaching a media element is supposed to pause it, but say so outright:
  // nothing should still be decoding on a panel that's slid off screen. The
  // element goes with it, so swiping back always starts the clip over.
  // Keyed on `showPlayer` alone — taking control must not trip this.
  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, [showPlayer]);

  // The player is gone, so the next one starts behind its poster again.
  if (!showPlayer && rolling) setRolling(false);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* The poster is never torn down for the player — it lies underneath
          until real frames are on screen, so arriving on a clip looks like
          the still coming to life rather than one element swapped for
          another. */}
      {posterUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={posterUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {!showPlayer ? (
        active ? (
          <button
            type="button"
            onClick={onTakeControl}
            aria-label="Play video"
            className="tap relative flex h-16 w-16 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur-sm transition-transform active:scale-95"
          >
            <PlayGlyph className="h-7 w-7 translate-x-0.5" />
          </button>
        ) : (
          <PlayGlyph className="relative h-10 w-10 text-white/70" />
        )
      ) : null}

      {showPlayer ? (
        <video
          ref={videoRef}
          key={item.id}
          src={`/api/memories/${item.id}/view`}
          poster={posterUrl}
          controls={controlled}
          autoPlay
          muted={!controlled}
          playsInline
          // The clip is about to play either way, so buffer it properly rather
          // than fetching metadata and then stalling on the first frame.
          preload="auto"
          onPlaying={() => setRolling(true)}
          // Before the native controls are up the clip has no UI of its own,
          // so the whole frame is the "turn the sound on" target — but only
          // for a press that stayed put. Paging past a muted clip must not
          // unmute it.
          onPointerDown={(event) => {
            pressedAt.current = { x: event.clientX, y: event.clientY };
          }}
          onClick={
            controlled
              ? undefined
              : (event) => {
                  const from = pressedAt.current;
                  pressedAt.current = null;
                  if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 10) {
                    return;
                  }
                  onTakeControl();
                }
          }
          className={`relative h-full w-full object-contain transition-opacity duration-200 ${
            rolling ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      {autoplaying && rolling ? (
        <button
          type="button"
          onClick={onTakeControl}
          aria-label="Unmute video"
          className="tap absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/50 text-white/70 backdrop-blur-sm transition-colors hover:bg-ink/70 hover:text-white"
        >
          <MutedGlyph className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}
