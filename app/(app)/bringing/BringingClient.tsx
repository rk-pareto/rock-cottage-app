"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { EmptyWell } from "@/components/ui/Card";
import { BRINGING_CATEGORIES, BRINGING_CATEGORY_INFO, type BringingCategory } from "@/lib/bringingCategories";
import { addBringingItem, deleteBringingItem, updateBringingItem } from "./actions";

export type Row = {
  id: string;
  name: string;
  category: BringingCategory;
  notes: string | null;
  responsibleMemberId: string;
  responsibleBy: string;
};

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
  const [category, setCategory] = useState<BringingCategory | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const groups = new Map<BringingCategory, Row[]>();
  for (const row of rows) {
    groups.set(row.category, [...(groups.get(row.category) ?? []), row]);
  }
  const sortedGroups = [...groups.entries()].sort(
    ([a], [b]) => BRINGING_CATEGORIES.indexOf(a) - BRINGING_CATEGORIES.indexOf(b),
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
    if (busy || name.trim().length === 0 || category === "") return;
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
    setCategory(row.category);
    setNotes(row.notes ?? "");
    setShowAdd(true);
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
          <div className="flex flex-col gap-1.5 px-0.5">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
              {BRINGING_CATEGORIES.map((value) => {
                const selected = category === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCategory(value)}
                    className={`tap rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                      selected
                        ? "border-ink bg-ink text-paper"
                        : "border-line text-ink-soft active:bg-subtle"
                    }`}
                  >
                    {BRINGING_CATEGORY_INFO[value].label}
                  </button>
                );
              })}
            </div>
            <p className="min-h-8 text-xs text-muted">
              {category
                ? BRINGING_CATEGORY_INFO[category].description
                : "Pick where this belongs, so people can see it's the right spot."}
            </p>
          </div>
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
              disabled={busy || name.trim().length === 0 || category === ""}
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
          Add to Public Goods
        </button>
      )}

      {rows.length === 0 ? (
        <EmptyWell>
          Nobody&apos;s claimed anything yet. Claim the ketchup before someone else does.
        </EmptyWell>
      ) : (
        <div className="flex flex-col gap-7">
          {sortedGroups.map(([groupCategory, items]) => (
            <section key={groupCategory}>
              <div className="mb-2.5 flex items-center gap-3">
                <h2 className="label shrink-0 text-muted">
                  {BRINGING_CATEGORY_INFO[groupCategory].label}
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
                <span className="shrink-0 text-xs font-bold text-muted">{items.length}</span>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-line">
                {items.map((row) => (
                  <li key={row.id} className="border-b border-line bg-card last:border-b-0">
                    <div className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9375rem] font-bold text-ink">{row.name}</p>
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
