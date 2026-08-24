"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
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
        <form onSubmit={submit} className="mb-6 flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ketchup"
            maxLength={200}
            className="tap rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-pine"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional) — Condiments, Cooking…"
            maxLength={80}
            className="tap rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-pine"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            maxLength={2000}
            className="tap rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-pine"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || name.trim().length === 0}
              className="tap flex-1 rounded-2xl bg-pine px-4 py-3 text-base font-bold text-white active:bg-pine-dark disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="tap rounded-2xl px-4 py-3 text-base font-bold text-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="tap mb-6 w-full rounded-2xl bg-pine px-4 py-3.5 text-base font-bold text-white active:bg-pine-dark"
        >
          + Add something I&apos;m bringing
        </button>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nobody&apos;s claimed anything yet. Claim the ketchup before someone else does.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {sortedGroups.map(([groupName, items]) => (
            <section key={groupName}>
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">{groupName}</h2>
              <ul className="flex flex-col gap-2">
                {items.map((row) => (
                  <li key={row.id} className="rounded-2xl border border-line bg-card">
                    <div className="flex items-center gap-3 p-3">
                      {canEdit(row) ? (
                        <button
                          type="button"
                          aria-label={row.packed ? `Unmark ${row.name} packed` : `Mark ${row.name} packed`}
                          onClick={() => togglePacked(row)}
                          className={`tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                            row.packed
                              ? "bg-pine text-white"
                              : "border-2 border-line text-transparent"
                          }`}
                        >
                          ✓
                        </button>
                      ) : (
                        <div
                          aria-hidden="true"
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                            row.packed ? "bg-pine/30 text-white" : "border-2 border-line text-transparent"
                          }`}
                        >
                          ✓
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-bold ${row.packed ? "text-muted line-through" : "text-ink"}`}>
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
                            className="tap rounded-lg px-2 text-sm font-bold text-lake"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(row.id)}
                            className="tap rounded-lg px-2 text-sm font-bold text-clay"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {confirmingId === row.id ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper p-2">
                        <span className="flex-1 text-sm text-ink">Delete “{row.name}”?</span>
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          className="tap rounded-xl bg-clay px-4 py-2 text-sm font-bold text-white"
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
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
