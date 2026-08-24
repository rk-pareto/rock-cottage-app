"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { useToast } from "@/components/ui/Toast";
import { deletePetEvent, updatePetEventTime } from "@/app/(app)/dogs/actions";
import {
  formatClock,
  formatWeekday,
  fromCottageInputValue,
  relativeTime,
  toCottageInputValue,
} from "@/lib/time";
import type { PetEventType } from "@/db/schema";

export type SheetEvent = {
  id: string;
  eventType: PetEventType;
  occurredAt: string;
  recordedBy: string;
};

const TYPE_LABEL: Record<PetEventType, string> = {
  outside: "Outside",
  poop: "Poop",
  fed: "Fed",
};

export function EventSheet({
  name,
  events,
  onClose,
}: {
  name: string;
  events: SheetEvent[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function beginEdit(event: SheetEvent) {
    setConfirmingId(null);
    setEditingId(event.id);
    setDraft(toCottageInputValue(new Date(event.occurredAt)));
  }

  function saveEdit(id: string) {
    const parsed = fromCottageInputValue(draft);
    if (Number.isNaN(parsed.getTime())) {
      toast("That time isn't valid.", "error");
      return;
    }
    setBusyId(id);
    startTransition(async () => {
      const result = await updatePetEventTime(id, parsed.toISOString());
      setBusyId(null);
      if (result.ok) {
        setEditingId(null);
        toast("Time updated");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  function confirmDelete(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await deletePetEvent(id);
      setBusyId(null);
      setConfirmingId(null);
      if (result.ok) {
        toast("Event deleted");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="flex-1" onClick={onClose} />
      <div className="max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-paper p-4 safe-bottom">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold text-ink">{name}&apos;s recent events</h3>
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-xl px-3 py-2 text-sm font-bold text-lake"
          >
            Done
          </button>
        </div>

        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Nothing recorded yet. Tap one of the big buttons.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => {
              const when = new Date(event.occurredAt);
              const busy = busyId === event.id;
              return (
                <li key={event.id} className="rounded-2xl border border-line bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{TYPE_LABEL[event.eventType]}</p>
                      <p className="text-sm text-muted">
                        <span className="font-semibold text-ink">
                          <RelativeTime iso={event.occurredAt} initial={relativeTime(when)} />
                        </span>
                        {" · "}
                        {event.recordedBy}
                      </p>
                      {/* The exact stamp stays visible — this is where times get edited. */}
                      <p className="text-xs text-muted">
                        {formatWeekday(when)} · {formatClock(when)}
                      </p>
                    </div>
                    {editingId === event.id ? null : (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => beginEdit(event)}
                          className="tap rounded-lg px-2 py-1 text-sm font-bold text-lake disabled:opacity-50"
                        >
                          Time
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingId(event.id)}
                          className="tap rounded-lg px-2 py-1 text-sm font-bold text-clay disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {editingId === event.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="tap min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-base text-ink"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveEdit(event.id)}
                        className="tap rounded-xl bg-pine px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="tap rounded-xl px-3 py-2 text-sm font-bold text-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  {confirmingId === event.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-paper p-2">
                      <span className="flex-1 text-sm text-ink">Delete this event?</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => confirmDelete(event.id)}
                        className="tap rounded-xl bg-clay px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busy ? "Deleting…" : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="tap rounded-xl px-3 py-2 text-sm font-bold text-muted"
                      >
                        Keep
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
