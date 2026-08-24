"use client";

import { useState, useTransition } from "react";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { useToast } from "@/components/ui/Toast";
import { recordPetEvent } from "@/app/(app)/dogs/actions";
import { relativeTime } from "@/lib/time";
import type { PetEventType } from "@/db/schema";
import { EventSheet, type SheetEvent } from "./EventSheet";

export type LatestEvent = { occurredAt: string; recordedBy: string } | null;

export type DogSectionProps = {
  slug: string;
  name: string;
  latest: Record<PetEventType, LatestEvent>;
  recent: SheetEvent[];
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

export function DogSection({ slug, name, latest, recent, currentMemberName }: DogSectionProps) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Optimistic overlay so a tap feels instant; the server render reconciles it.
  const [optimistic, setOptimistic] = useState<Partial<Record<PetEventType, LatestEvent>>>({});
  const [pendingType, setPendingType] = useState<PetEventType | null>(null);

  function handleTap(type: PetEventType) {
    if (pendingType) return; // guards against double-taps
    setPendingType(type);
    const now = new Date().toISOString();
    setOptimistic((prev) => ({
      ...prev,
      [type]: { occurredAt: now, recordedBy: currentMemberName },
    }));

    startTransition(async () => {
      const result = await recordPetEvent(slug, type);
      setPendingType(null);
      if (!result.ok) {
        // Roll the optimistic value back — the real state is whatever the
        // server last rendered.
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
        toast(result.error, "error");
      }
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
          return (
            <div key={action.type} className="flex flex-col gap-1.5">
              {/* Still the biggest thing on the screen — the flourish is gone,
                  the target isn't. */}
              <button
                type="button"
                onClick={() => handleTap(action.type)}
                disabled={Boolean(pendingType)}
                className={`tap flex w-full items-center gap-3 rounded-xl px-5 py-4 text-left text-[1.0625rem] font-extrabold tracking-tight text-white transition active:scale-[0.995] disabled:opacity-60 ${action.tone}`}
              >
                {action.icon}
                <span className="flex-1">{busy ? "Recording…" : action.label(name)}</span>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg leading-none"
                >
                  +
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
    </section>
  );
}
