"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { useToast } from "@/components/ui/Toast";
import { recordPetEvent } from "@/app/(app)/dogs/actions";
import { isLockedOut } from "@/lib/dogLock";
import { relativeTime } from "@/lib/time";
import type { PetEventType } from "@/db/schema";
import { EventSheet, type SheetEvent } from "./EventSheet";

export type LatestEvent = { occurredAt: string; recordedBy: string } | null;

export type DogSectionProps = {
  slug: string;
  name: string;
  latest: Record<PetEventType, LatestEvent>;
  recent: SheetEvent[];
  /** Server render time, so the first client render locks the same buttons. */
  renderedAt: string;
  currentMemberName: string;
};

const ACTIONS: {
  type: PetEventType;
  label: (name: string) => string;
  status: string;
  tone: string;
  icon: React.ReactNode;
}[] = [
  {
    type: "outside",
    label: (n) => `Let ${n} out`,
    status: "Last outside",
    tone: "bg-pine active:bg-pine-dark",
    icon: (
      <ActionIcon>
        <path d="M4 12h11" />
        <path d="M11.5 8.5 15 12l-3.5 3.5" />
        <path d="M15.5 4.5H19a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-3.5" />
      </ActionIcon>
    ),
  },
  {
    type: "poop",
    label: (n) => `${n} pooped`,
    status: "Last poop",
    tone: "bg-amber active:bg-clay",
    icon: (
      <ActionIcon>
        <path d="M9 8.5a2.5 2.5 0 0 1 4.4-1.6" />
        <path d="M7 13a2.5 2.5 0 0 1 .4-4.4" />
        <path d="M5.5 18.5h13a2.5 2.5 0 0 0 0-5h-1a2.5 2.5 0 0 0-2.2-3.7H9.7A2.5 2.5 0 0 0 7.5 13.5h-2a2.5 2.5 0 0 0 0 5Z" />
      </ActionIcon>
    ),
  },
  {
    type: "fed",
    label: (n) => `Fed ${n}`,
    status: "Last fed",
    tone: "bg-lake active:bg-pine-dark",
    icon: (
      <ActionIcon>
        <path d="M4.5 11h15a7.5 7.5 0 0 1-7.5 7.5A7.5 7.5 0 0 1 4.5 11Z" />
        <path d="M3.5 18.5h17" />
        <path d="M9 7.5c0-1 1-1.4 1-2.4M13 7.5c0-1 1-1.4 1-2.4" />
      </ActionIcon>
    ),
  },
];

// Long enough to actually register as "yep, that logged" — 550ms read as a
// flicker in practice, easy to miss on a real tap-and-glance-away.
const CONFIRM_MS = 1000;

// How often the lock re-checks itself while the page sits open, so a button
// comes back on its own a beat after the window passes. See `lib/dogLock` for
// the rule itself.
const LOCK_TICK_MS = 15_000;

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`animate-[check-pop_0.18s_ease-out] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function DogSection({
  slug,
  name,
  latest,
  recent,
  renderedAt,
  currentMemberName,
}: DogSectionProps) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Optimistic overlay so a tap feels instant; the server render reconciles it.
  const [optimistic, setOptimistic] = useState<Partial<Record<PetEventType, LatestEvent>>>({});
  const [pendingType, setPendingType] = useState<PetEventType | null>(null);
  // The big center-screen confirmation flash — this is the one people
  // actually notice; the button badge above is a quieter echo of it.
  const [centerConfirm, setCenterConfirm] = useState<PetEventType | null>(null);
  const centerConfirmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Now", as far as the lockout is concerned. Starts at the server's render
  // time so hydration matches, then keeps up on its own.
  const [now, setNow] = useState(() => new Date(renderedAt).getTime());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, LOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (centerConfirmTimeout.current) clearTimeout(centerConfirmTimeout.current);
    },
    [],
  );

  function dropOptimistic(type: PetEventType) {
    setOptimistic((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
  }

  function handleTap(type: PetEventType, locked: boolean) {
    if (pendingType || locked) return; // guards against double-taps
    setPendingType(type);
    const tappedAt = new Date();
    setOptimistic((prev) => ({
      ...prev,
      [type]: { occurredAt: tappedAt.toISOString(), recordedBy: currentMemberName },
    }));

    startTransition(async () => {
      const result = await recordPetEvent(slug, type);
      setPendingType(null);
      if (!result.ok) {
        // Roll the optimistic value back — the real state is whatever the
        // server last rendered.
        dropOptimistic(type);
        toast(result.error, "error");
        return;
      }

      setCenterConfirm(type);
      if (centerConfirmTimeout.current) clearTimeout(centerConfirmTimeout.current);
      centerConfirmTimeout.current = setTimeout(() => setCenterConfirm(null), CONFIRM_MS);

      // Hand back to the server value that arrived with the action's
      // revalidate. Holding the optimistic one would out-vote a later edit in
      // the history sheet, and an edit is exactly what should reopen a button.
      dropOptimistic(type);
      // Keep "now" honest in case the tab had been idle since the last tick.
      setNow(Date.now());
    });
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
        <h2 className="font-display text-[1.75rem] leading-none text-ink">{name}</h2>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="tap rounded-lg px-3 py-2 text-xs font-bold text-ink-soft transition-colors hover:text-ink active:bg-subtle"
        >
          History
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {ACTIONS.map((action) => {
          const value = optimistic[action.type] ?? latest[action.type];
          const busy = pendingType === action.type;
          const locked = isLockedOut(value?.occurredAt, now);
          return (
            <div key={action.type} className="flex flex-col gap-1.5">
              {/* Still the biggest thing on the screen — the flourish is gone,
                  the target isn't. */}
              <button
                type="button"
                onClick={() => handleTap(action.type, locked)}
                disabled={Boolean(pendingType) || locked}
                className={`tap flex w-full items-center gap-3 rounded-xl px-5 py-4 text-left text-[1.0625rem] font-extrabold tracking-tight text-white transition active:scale-[0.995] disabled:opacity-60 ${action.tone}`}
              >
                {action.icon}
                <span className="flex-1">{busy ? "Recording…" : action.label(name)}</span>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg leading-none"
                >
                  {locked ? <CheckIcon /> : "+"}
                </span>
              </button>
              <p className="flex flex-wrap items-baseline gap-x-2 px-1 text-sm">
                <span className="label text-muted">{action.status}</span>
                {value ? (
                  <>
                    <span className="font-bold text-ink">
                      <RelativeTime
                        iso={value.occurredAt}
                        initial={relativeTime(new Date(value.occurredAt))}
                      />
                    </span>
                    <span className="text-muted">by {value.recordedBy}</span>
                  </>
                ) : (
                  <span className="text-muted">nothing recorded yet</span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {sheetOpen ? (
        <EventSheet name={name} events={recent} onClose={() => setSheetOpen(false)} />
      ) : null}

      {centerConfirm ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center px-6"
        >
          <div
            className="flex flex-col items-center gap-3 rounded-2xl bg-ink/95 px-8 py-7 text-paper shadow-[0_20px_50px_-12px_rgba(14,18,22,0.55)]"
            style={{ animation: `confirm-flash ${CONFIRM_MS}ms ease-out both` }}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
              <CheckIcon className="h-8 w-8" />
            </span>
            <span className="text-sm font-extrabold tracking-tight">
              {ACTIONS.find((a) => a.type === centerConfirm)?.label(name)}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
