"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { EmptyWell } from "@/components/ui/Card";
import { Check } from "@/components/ui/icons";
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
          className="tap min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
        />
        <button
          type="submit"
          disabled={adding || name.trim().length === 0}
          className="tap shrink-0 rounded-xl bg-ink px-5 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.98] disabled:opacity-30"
        >
          Add
        </button>
      </form>

      {open.length === 0 && pending.length === 0 ? (
        <EmptyWell>Nothing needed from town. Enjoy it while it lasts.</EmptyWell>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line">
          {open.map((row) => (
            <li key={row.id} className="border-b border-line bg-card last:border-b-0">
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  aria-label={`Mark ${row.name} picked up`}
                  disabled={busyId === row.id}
                  onClick={() => togglePicked(row, true)}
                  className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-transparent transition-colors active:bg-subtle disabled:opacity-50"
                >
                  <Check />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-bold text-ink">{row.name}</p>
                  <p className="text-xs text-muted">
                    {row.requestedBy} ·{" "}
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
                    className="tap shrink-0 rounded-lg px-2 text-xs font-bold text-muted transition-colors hover:text-clay disabled:opacity-50"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              {confirmingId === row.id ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-subtle p-2.5">
                  <span className="flex-1 text-sm text-ink">Delete &ldquo;{row.name}&rdquo;?</span>
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={busyId === row.id}
                    className="tap rounded-lg bg-clay px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
                  >
                    Delete
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
          ))}
          {pending.map((n) => (
            <li key={`pending-${n}`} className="border-b border-line bg-card opacity-50 last:border-b-0">
              <div className="flex items-center gap-3 p-3">
                <div className="h-11 w-11 shrink-0 rounded-full border border-line-strong" />
                <p className="truncate text-[0.9375rem] font-bold text-ink">{n}</p>
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
            className="tap flex w-full items-center gap-3 py-2 text-left"
          >
            <span className="label shrink-0 text-muted">Picked up · {pickedUp.length}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            <span aria-hidden="true" className="shrink-0 text-xs text-muted">
              {showPickedUp ? "Hide" : "Show"}
            </span>
          </button>
          {showPickedUp ? (
            <ul className="mt-2 overflow-hidden rounded-2xl border border-line">
              {pickedUp.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 border-b border-line bg-card p-3 last:border-b-0"
                >
                  <button
                    type="button"
                    aria-label={`Undo pickup of ${row.name}`}
                    disabled={busyId === row.id}
                    onClick={() => togglePicked(row, false)}
                    className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine text-white disabled:opacity-50"
                  >
                    <Check />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] font-bold text-muted line-through">
                      {row.name}
                    </p>
                    <p className="text-xs text-muted">
                      Picked up by {row.pickedUpBy ?? "someone"}
                    </p>
                  </div>
                  {canDelete(row) ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => remove(row)}
                      className="tap shrink-0 rounded-lg px-2 text-xs font-bold text-muted transition-colors hover:text-clay disabled:opacity-50"
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
