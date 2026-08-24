"use client";

import { useState, useTransition } from "react";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { useToast } from "@/components/ui/Toast";
import { recordPetEvent } from "@/app/(app)/dogs/actions";
import { formatClock, relativeTime } from "@/lib/time";
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

      <div className="flex flex-col gap-3">
        {ACTIONS.map((action) => {
          const value = optimistic[action.type] ?? latest[action.type];
          const busy = pendingType === action.type;
          return (
            <div key={action.type} className="overflow-hidden rounded-3xl border border-line bg-card">
              <button
                type="button"
                onClick={() => handleTap(action.type)}
                disabled={Boolean(pendingType)}
                className={`tap w-full px-4 py-6 text-xl font-extrabold tracking-wide text-white transition disabled:opacity-70 ${action.tone}`}
              >
                {busy ? "…" : action.label(name)}
              </button>
              <div className="px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {action.status}
                </p>
                {value ? (
                  <p className="mt-0.5 text-sm text-ink">
                    <span className="font-bold">{formatClock(new Date(value.occurredAt))}</span>
                    {" · "}
                    <RelativeTime
                      iso={value.occurredAt}
                      initial={relativeTime(new Date(value.occurredAt))}
                    />
                    {" · "}
                    <span className="text-muted">{value.recordedBy}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-muted">Not yet today</p>
                )}
              </div>
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
