"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { EmptyWell } from "@/components/ui/Card";
import {
  addBringingItem,
  deleteBringingItem,
  setPacked,
  updateBringingItem,
} from "./actions";

export type Row = {
  id: string;
  name: string;
  category: string | null;
  notes: string | null;
  responsibleMemberId: string;
  responsibleBy: string;
  packed: boolean;
};

const UNCATEGORIZED = "Everything else";

export function BringingClient({
  rows,
  currentMemberId,
  isAdmin,
}: {
  rows: Row[];
  currentMemberId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.category?.trim() || UNCATEGORIZED;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b),
  );

  const canEdit = (row: Row) => row.responsibleMemberId === currentMemberId || isAdmin;

  function resetForm() {
    setName("");
    setCategory("");
    setNotes("");
    setEditingId(null);
    setShowAdd(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || name.trim().length === 0) return;
    setBusy(true);
    const payload = { name, category, notes };

    startTransition(async () => {
      const result = editingId
        ? await updateBringingItem(editingId, payload)
        : await addBringingItem(payload);
      setBusy(false);
      if (result.ok) {
        toast(editingId ? "Saved" : `Added ${payload.name.trim()}`);
        resetForm();
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  function beginEdit(row: Row) {
    setEditingId(row.id);
    setName(row.name);
    setCategory(row.category ?? "");
    setNotes(row.notes ?? "");
    setShowAdd(true);
  }

  function togglePacked(row: Row) {
    startTransition(async () => {
      const result = await setPacked(row.id, !row.packed);
      if (result.ok) router.refresh();
      else toast(result.error, "error");
    });
  }

  function remove(row: Row) {
    startTransition(async () => {
      const result = await deleteBringingItem(row.id);
      setConfirmingId(null);
      if (result.ok) {
        toast("Deleted");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <>
      {showAdd ? (
        <form
          onSubmit={submit}
          className="mb-6 flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-4"
        >
          <p className="label mb-0.5 text-muted">{editingId ? "Edit item" : "New item"}</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ketchup"
            maxLength={200}
            className="tap rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional) — Condiments, Cooking…"
            maxLength={80}
            className="tap rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            maxLength={2000}
            className="tap rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
          />
          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={busy || name.trim().length === 0}
              className="tap flex-1 rounded-xl bg-ink px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.99] disabled:opacity-30"
            >
              {busy ? "Saving…" : editingId ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="tap rounded-xl px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-ink-soft transition-colors active:bg-subtle"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="tap mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3.5 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.99]"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          Add something I&apos;m bringing
        </button>
      )}

      {rows.length === 0 ? (
        <EmptyWell>
          Nobody&apos;s claimed anything yet. Claim the ketchup before someone else does.
        </EmptyWell>
      ) : (
        <div className="flex flex-col gap-7">
          {sortedGroups.map(([groupName, items]) => (
            <section key={groupName}>
              <div className="mb-2.5 flex items-center gap-3">
                <h2 className="label shrink-0 text-muted">{groupName}</h2>
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
                <span className="shrink-0 text-xs font-bold text-muted">{items.length}</span>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-line">
                {items.map((row) => (
                  <li key={row.id} className="border-b border-line bg-card last:border-b-0">
                    <div className="flex items-center gap-3 p-3">
                      {canEdit(row) ? (
                        <button
                          type="button"
                          aria-label={row.packed ? `Unmark ${row.name} packed` : `Mark ${row.name} packed`}
                          onClick={() => togglePacked(row)}
                          className={`tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                            row.packed
                              ? "bg-pine text-white"
                              : "border border-line-strong text-transparent active:bg-subtle"
                          }`}
                        >
                          <Check />
                        </button>
                      ) : (
                        <div
                          aria-hidden="true"
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                            row.packed
                              ? "bg-pine/12 text-pine"
                              : "border border-line-strong text-transparent"
                          }`}
                        >
                          <Check />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-[0.9375rem] font-bold ${row.packed ? "text-muted line-through" : "text-ink"}`}
                        >
                          {row.name}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {row.responsibleBy}
                          {row.notes ? ` · ${row.notes}` : ""}
                        </p>
                      </div>
                      {canEdit(row) ? (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => beginEdit(row)}
                            className="tap rounded-lg px-2 text-xs font-bold text-ink-soft transition-colors hover:text-ink"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(row.id)}
                            className="tap rounded-lg px-2 text-xs font-bold text-muted transition-colors hover:text-clay"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {confirmingId === row.id ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-subtle p-2.5">
                        <span className="flex-1 text-sm text-ink">
                          Delete &ldquo;{row.name}&rdquo;?
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          className="tap rounded-lg bg-clay px-4 py-2 text-xs font-extrabold text-white"
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
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** A drawn tick, so the checkbox doesn't depend on a text glyph's metrics. */
function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}
