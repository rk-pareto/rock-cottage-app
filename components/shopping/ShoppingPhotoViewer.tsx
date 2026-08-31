"use client";

import { useEffect } from "react";

/**
 * A shopping photo, big enough to actually read a label off.
 *
 * Deliberately not the Memories lightbox: there is no gallery to swipe
 * through here, one item has at most one photo, and the whole point of the
 * screen is that someone is standing in a shop holding their phone. So it is
 * a plain full-bleed view with the item's name on it, plus the two edits the
 * person who asked for it might want.
 */
export function ShoppingPhotoViewer({
  name,
  photoUrl,
  canEdit,
  busy,
  onReplace,
  onRemove,
  onClose,
}: {
  name: string;
  photoUrl: string;
  canEdit: boolean;
  busy: boolean;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col [animation:lightbox-in_0.2s_ease]"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of ${name}`}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink"
      />

      <div className="relative flex items-center justify-between gap-3 p-3 text-white">
        <span className="min-w-0 truncate text-[0.9375rem] font-bold">{name}</span>
        <button
          type="button"
          onClick={onClose}
          className="tap shrink-0 rounded-lg px-3 py-2 text-xs font-extrabold text-white/80 transition-colors hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="pointer-events-none relative flex flex-1 items-center justify-center overflow-hidden p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={`Photo of ${name}`}
          className="max-h-full max-w-full rounded-xl object-contain"
        />
      </div>

      {canEdit ? (
        <div className="relative flex gap-2 p-3 safe-bottom">
          <button
            type="button"
            onClick={onReplace}
            disabled={busy}
            className="tap flex-1 rounded-xl bg-white/10 px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-white transition active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? "Working…" : "Replace"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="tap rounded-xl px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-white/70 transition-colors active:text-clay disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}
