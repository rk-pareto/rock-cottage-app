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
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/30 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" aria-label="Close" className="min-h-6 flex-1" onClick={onClose} />
      <div className="flex h-[94dvh] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-paper shadow-[0_-12px_40px_-12px_rgba(14,18,22,0.25)]">
        {/* Grab handle: the sheet should read as draggable-ish even though the
            only way out is Done or the backdrop. Header stays put; only the
            list below it scrolls. */}
        <div className="shrink-0 px-4">
          <div aria-hidden="true" className="mx-auto my-3 h-1 w-10 rounded-full bg-line-strong" />
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
            <h3 className="font-display text-[1.375rem] leading-none text-ink">
              {name}&apos;s history
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="tap rounded-lg px-3 py-2 text-xs font-extrabold text-ink transition-colors active:bg-subtle"
            >
              Done
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 safe-bottom">
          {events.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted">
              Nothing recorded yet. Tap one of the big buttons.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-line">
              {events.map((event) => {
                const when = new Date(event.occurredAt);
                const busy = busyId === event.id;
                return (
                  <li key={event.id} className="border-b border-line bg-card p-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="label text-muted">{TYPE_LABEL[event.eventType]}</p>
                        <p className="mt-1 text-sm text-muted">
                          <span className="font-bold text-ink">
                            <RelativeTime iso={event.occurredAt} initial={relativeTime(when)} />
                          </span>
                          {" · "}
                          {event.recordedBy}
                        </p>
                        {/* The exact stamp stays visible — this is where times get edited. */}
                        <p className="mt-0.5 text-xs text-muted">
                          {formatWeekday(when)} · {formatClock(when)}
                        </p>
                      </div>
                      {editingId === event.id ? null : (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => beginEdit(event)}
                            className="tap rounded-lg px-2 py-1 text-xs font-bold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
                          >
                            Time
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmingId(event.id)}
                            className="tap rounded-lg px-2 py-1 text-xs font-bold text-muted transition-colors hover:text-clay disabled:opacity-50"
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
                          className="tap min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveEdit(event.id)}
                          className="tap rounded-lg bg-ink px-4 py-2 text-xs font-extrabold text-paper disabled:opacity-30"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="tap rounded-lg px-3 py-2 text-xs font-extrabold text-ink-soft"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}

                    {confirmingId === event.id ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-subtle p-2">
                        <span className="flex-1 text-sm text-ink">Delete this event?</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => confirmDelete(event.id)}
                          className="tap rounded-lg bg-clay px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
                        >
                          {busy ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="tap rounded-lg px-3 py-2 text-xs font-extrabold text-ink-soft"
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
    </div>
  );
}
