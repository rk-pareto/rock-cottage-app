"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markIntroSeen } from "@/app/(app)/intro/actions";
import { introSteps } from "@/lib/intro/steps";

/** Breathing room between the spotlight and the tab it's lighting up. */
const SPOT_PAD = 6;
/** Gap between the spotlight and the card sitting above it. */
const CARD_GAP = 14;
/** Wider than any phone, so one shadow dims everything outside the spotlight. */
const DIM = "0 0 0 9999px rgba(14,18,22,0.58)";

type Spot = {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Read with the rect, so the card can be placed from the viewport's bottom. */
  viewportHeight: number;
};

function subscribeToViewport(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

/**
 * The nav tab's position, as a string — `useSyncExternalStore` compares
 * snapshots by identity, and a fresh object every render would spin forever.
 * Empty means "nothing to light up": no target, or not in the DOM yet.
 */
function readSpot(target: string | null): string {
  if (!target || typeof document === "undefined") return "";
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return "";
  const r = el.getBoundingClientRect();
  return [r.top, r.left, r.width, r.height, window.innerHeight].join(",");
}

function parseSpot(snapshot: string): Spot | null {
  if (!snapshot) return null;
  const [top, left, width, height, viewportHeight] = snapshot.split(",").map(Number);
  return { top, left, width, height, viewportHeight };
}

/**
 * The first-login tour. It doesn't move the user around the app — it lights up
 * one bottom-nav tab at a time and says what's behind it, so the map is learned
 * in place. Modal on purpose: the nav underneath stays visible but untappable
 * until the tour is finished or skipped, and either way that's recorded on the
 * member so it never comes back uninvited.
 */
export function IntroTour({ dogsLabel }: { dogsLabel: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const steps = introSteps(dogsLabel);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const target = step.target;

  // The nav only exists in the browser, and it moves when the phone turns.
  // `readSpot` returns a plain string, so an unstable reader is harmless —
  // React only re-renders when the measurement itself actually changes.
  const spot = parseSpot(
    useSyncExternalStore(
      subscribeToViewport,
      () => readSpot(target),
      () => "",
    ),
  );

  const finish = useCallback(() => {
    setDone(true);
    startTransition(async () => {
      await markIntroSeen();
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      else if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finish, steps.length]);

  // Move focus to the card on each step so a screen reader reads the new one.
  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  if (done) return null;

  const card = (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="mx-auto max-w-md rounded-2xl border border-line bg-paper p-5 shadow-[0_18px_50px_-12px_rgba(14,18,22,0.55)] outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="label text-pine">{step.label}</p>
        {isLast ? null : (
          <button
            type="button"
            onClick={finish}
            className="-my-2 -mr-2 rounded-lg px-2 py-2 text-xs font-bold text-muted transition-colors hover:text-ink"
          >
            Skip
          </button>
        )}
      </div>

      <h2 className="mt-1.5 font-display text-[1.625rem] leading-tight text-ink">{step.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>

      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <ol
          className="flex flex-1 items-center gap-1.5"
          aria-label={`Step ${index + 1} of ${steps.length}`}
        >
          {steps.map((s, i) => (
            <li
              key={s.id}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-4 bg-ink" : "w-1.5 bg-line-strong"
              }`}
            />
          ))}
        </ol>
        {index > 0 ? (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className="tap rounded-xl px-3 py-2 text-xs font-extrabold tracking-tight text-ink-soft transition-colors active:bg-subtle"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          className="tap rounded-xl bg-ink px-5 py-2.5 text-xs font-extrabold tracking-tight text-paper transition-colors active:opacity-80"
        >
          {isLast ? "Start the week" : "Next"}
        </button>
      </div>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Intro tour" className="fixed inset-0 z-50">
      {spot ? (
        <>
          {/* One element does both jobs: the ring around the tab, and — via a
              shadow wider than the screen — the dim over everything else. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-2xl transition-all duration-300 ease-out"
            style={{
              top: spot.top - SPOT_PAD,
              left: spot.left - SPOT_PAD,
              width: spot.width + SPOT_PAD * 2,
              height: spot.height + SPOT_PAD * 2,
              boxShadow: `0 0 0 2px var(--color-pine), ${DIM}`,
            }}
          />
          <div
            className="absolute inset-x-0 px-4"
            style={{ bottom: spot.viewportHeight - spot.top + CARD_GAP }}
          >
            {card}
          </div>
        </>
      ) : (
        <>
          <div aria-hidden="true" className="absolute inset-0 bg-ink/60" />
          <div className="absolute inset-0 flex items-center justify-center px-4">{card}</div>
        </>
      )}
    </div>
  );
}
