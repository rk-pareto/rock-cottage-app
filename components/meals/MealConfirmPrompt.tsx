"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { confirmMeal, updateMealTitle } from "@/app/(app)/meals/actions";

export type MealPrompt = {
  id: string;
  title: string;
  /** Pre-formatted on the server: "Tomorrow · Dinner · 5:00 PM". */
  when: string;
  /** The other cook(s), when this meal has more than one. */
  sharedWith?: string;
};

/**
 * The nudge the cook gets 22 hours before service (spec §9.5). It is a
 * question, not a card — amber rule down the left, two answers, and it leaves
 * the feed the moment either one is given.
 */
export function MealConfirmPrompt({ meal }: { meal: MealPrompt }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(meal.title);
  const [busy, setBusy] = useState(false);

  function confirm() {
    setBusy(true);
    startTransition(async () => {
      const result = await confirmMeal(meal.id);
      setBusy(false);
      if (result.ok) {
        // `note` means the other cook answered first — their answer stands.
        toast(result.note ?? "Confirmed");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    startTransition(async () => {
      const result = await updateMealTitle(meal.id, trimmed);
      setBusy(false);
      if (result.ok) {
        toast(result.note ?? "Menu updated");
        setEditing(false);
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_1px_rgba(14,18,22,0.03)]">
      <div className="border-l-[3px] border-amber p-4">
        <p className="label text-amber">{meal.when}</p>

        {editing ? (
          <form onSubmit={save} className="mt-2">
            <label htmlFor={`meal-title-${meal.id}`} className="sr-only">
              What are you making?
            </label>
            <input
              id={`meal-title-${meal.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you making?"
              maxLength={200}
              enterKeyHint="done"
              autoFocus
              className="tap w-full rounded-xl border border-line bg-card px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
            />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Changing the name clears the menu description and photo — they
              describe the old dish.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={busy || title.trim().length === 0}
                className="tap flex-1 rounded-xl bg-ink px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.98] disabled:opacity-30"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setTitle(meal.title);
                }}
                disabled={busy}
                className="tap rounded-xl px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-ink-soft transition-colors active:bg-subtle disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h3 className="mt-2 font-display text-[1.5rem] leading-tight text-ink">
              {meal.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {meal.sharedWith
                ? `You and ${meal.sharedWith} are cooking this one — either of you can answer. Still the plan?`
                : "You're cooking this one. Still the plan?"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="tap flex-1 rounded-xl bg-ink px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.98] disabled:opacity-30"
              >
                Still on
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="tap rounded-xl border border-line-strong px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-ink-soft transition-colors active:bg-subtle disabled:opacity-50"
              >
                Change it
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
