"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { relativeTime } from "@/lib/time";
import { addShoppingItem, deleteShoppingItem, setPickedUp } from "./actions";

export type Row = {
  id: string;
  name: string;
  createdAt: string;
  requestedBy: string;
  requestedByMemberId: string;
  pickedUpAt: string | null;
  pickedUpBy: string | null;
};

export function ShoppingClient({
  open,
  pickedUp,
  currentMemberId,
  isAdmin,
}: {
  open: Row[];
  pickedUp: Row[];
  currentMemberId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPickedUp, setShowPickedUp] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Names added this render pass, shown instantly before the server catches up.
  const [pending, setPending] = useState<string[]>([]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    setName("");
    setPending((p) => [...p, trimmed]);
    inputRef.current?.focus();

    startTransition(async () => {
      const result = await addShoppingItem(trimmed);
      setAdding(false);
      setPending((p) => p.filter((n) => n !== trimmed));
      if (result.ok) {
        router.refresh();
      } else {
        toast(result.error, "error");
        setName((current) => current || trimmed); // give the text back
      }
    });
  }

  function togglePicked(row: Row, next: boolean) {
    setBusyId(row.id);
    startTransition(async () => {
      const result = await setPickedUp(row.id, next);
      setBusyId(null);
      if (result.ok) {
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  function remove(row: Row) {
    setBusyId(row.id);
    startTransition(async () => {
      const result = await deleteShoppingItem(row.id);
      setBusyId(null);
      setConfirmingId(null);
      if (result.ok) {
        toast("Deleted");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  const canDelete = (row: Row) => row.requestedByMemberId === currentMemberId || isAdmin;

  return (
    <>
      <form onSubmit={submit} className="mb-6 flex gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Milk, ice, bug spray…"
          maxLength={200}
          enterKeyHint="done"
          className="tap min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 py-3 text-base text-ink outline-none focus:border-pine"
        />
        <button
          type="submit"
          disabled={adding || name.trim().length === 0}
          className="tap shrink-0 rounded-2xl bg-pine px-5 text-base font-bold text-white active:bg-pine-dark disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {open.length === 0 && pending.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nothing needed from town. Enjoy it while it lasts.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((row) => (
            <li key={row.id} className="rounded-2xl border border-line bg-card">
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  aria-label={`Mark ${row.name} picked up`}
                  disabled={busyId === row.id}
                  onClick={() => togglePicked(row, true)}
                  className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-line text-transparent active:bg-paper disabled:opacity-50"
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{row.name}</p>
                  <p className="text-xs text-muted">
                    Added by {row.requestedBy} ·{" "}
                    <RelativeTime
                      iso={row.createdAt}
                      initial={relativeTime(new Date(row.createdAt))}
                    />
                  </p>
                </div>
                {canDelete(row) ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => setConfirmingId(row.id)}
                    className="tap shrink-0 rounded-lg px-2 text-sm font-bold text-clay disabled:opacity-50"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              {confirmingId === row.id ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper p-2">
                  <span className="flex-1 text-sm text-ink">Delete “{row.name}”?</span>
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={busyId === row.id}
                    className="tap rounded-xl bg-clay px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Delete
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
          ))}
          {pending.map((n) => (
            <li key={`pending-${n}`} className="rounded-2xl border border-line bg-card opacity-60">
              <div className="flex items-center gap-3 p-3">
                <div className="h-11 w-11 shrink-0 rounded-xl border-2 border-line" />
                <p className="truncate font-bold text-ink">{n}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pickedUp.length > 0 ? (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowPickedUp((v) => !v)}
            className="tap flex w-full items-center justify-between rounded-2xl px-1 py-2 text-sm font-bold text-muted"
          >
            <span>Picked up · {pickedUp.length}</span>
            <span aria-hidden="true">{showPickedUp ? "▾" : "▸"}</span>
          </button>
          {showPickedUp ? (
            <ul className="mt-2 flex flex-col gap-2">
              {pickedUp.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-card/60 p-3"
                >
                  <button
                    type="button"
                    aria-label={`Undo pickup of ${row.name}`}
                    disabled={busyId === row.id}
                    onClick={() => togglePicked(row, false)}
                    className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pine text-lg font-bold text-white disabled:opacity-50"
                  >
                    ✓
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-muted line-through">{row.name}</p>
                    <p className="text-xs text-muted">
                      Picked up by {row.pickedUpBy ?? "someone"}
                    </p>
                  </div>
                  {canDelete(row) ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => remove(row)}
                      className="tap shrink-0 rounded-lg px-2 text-sm font-bold text-clay disabled:opacity-50"
                    >
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
