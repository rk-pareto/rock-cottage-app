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

const ACTIONS: { type: PetEventType; label: (name: string) => string; status: string; tone: string }[] = [
  {
    type: "outside",
    label: (n) => `LET ${n.toUpperCase()} OUT`,
    status: "Last outside",
    tone: "bg-pine active:bg-pine-dark",
  },
  {
    type: "poop",
    label: (n) => `${n.toUpperCase()} POOPED`,
    status: "Last poop",
    tone: "bg-amber active:bg-clay",
  },
  {
    type: "fed",
    label: (n) => `FED ${n.toUpperCase()}`,
    status: "Last fed",
    tone: "bg-lake active:bg-pine-dark",
  },
];

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
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-ink">{name}</h2>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="tap rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-muted active:bg-paper"
        >
          EDIT
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {ACTIONS.map((action) => {
          const value = optimistic[action.type] ?? latest[action.type];
          const busy = pendingType === action.type;
          return (
            <div key={action.type} className="flex flex-col gap-2">
              {/* The raised, full-colour pill is the button; the status line
                  below sits outside it so it never reads as a card header. */}
              <button
                type="button"
                onClick={() => handleTap(action.type)}
                disabled={Boolean(pendingType)}
                className={`tap flex w-full items-center justify-between gap-3 rounded-full px-6 py-5 text-lg font-extrabold tracking-wide text-white shadow-[0_3px_0_rgba(38,32,26,0.22)] transition active:translate-y-[3px] active:shadow-none disabled:opacity-70 ${action.tone}`}
              >
                <span>{busy ? "…" : action.label(name)}</span>
                <span aria-hidden="true" className="text-2xl leading-none opacity-80">
                  +
                </span>
              </button>
              <p className="flex flex-wrap items-baseline gap-x-2 px-2 text-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  {action.status}
                </span>
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
