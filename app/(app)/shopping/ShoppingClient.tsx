"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { EmptyWell } from "@/components/ui/Card";
import { CameraGlyph, Check } from "@/components/ui/icons";
import { ShoppingPhotoViewer } from "@/components/shopping/ShoppingPhotoViewer";
import { relativeTime } from "@/lib/time";
import { uploadShoppingPhoto } from "@/lib/uploads/browser";
import {
  addShoppingItem,
  confirmPickedUp,
  deleteShoppingItem,
  removeShoppingPhoto,
  setPickedUp,
} from "./actions";

export type Row = {
  id: string;
  name: string;
  createdAt: string;
  requestedBy: string;
  requestedByMemberId: string;
  pickedUpAt: string | null;
  pickedUpBy: string | null;
  /** Presigned, short-lived; null when there's no photo or it wouldn't sign. */
  photoUrl: string | null;
};

/** An item typed in but not yet acknowledged by the server, shown straight
 *  away — with its photo, which is still uploading behind it. */
type Pending = { key: number; name: string; previewUrl: string | null };

export function ShoppingClient({
  open,
  pickedUp,
  currentMemberId,
  isAdmin,
  storageReady,
}: {
  open: Row[];
  pickedUp: Row[];
  currentMemberId: string;
  isAdmin: boolean;
  storageReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const composeFileInput = useRef<HTMLInputElement>(null);
  const rowFileInput = useRef<HTMLInputElement>(null);
  const nextPendingKey = useRef(0);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPickedUp, setShowPickedUp] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Items added this render pass, shown instantly before the server catches up.
  const [pending, setPending] = useState<Pending[]>([]);
  // Items checked but not yet confirmed with "Got it".
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // The photo waiting to go up with the item currently being typed.
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  // The item whose photo is being uploaded, replaced or removed right now.
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  // Which existing item a row-level photo pick is for — the file input is
  // shared, so the target has to be remembered across the OS picker.
  const photoTargetId = useRef<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || adding) return;

    const attached = photo;
    const entry: Pending = {
      key: nextPendingKey.current++,
      name: trimmed,
      previewUrl: attached?.previewUrl ?? null,
    };

    setAdding(true);
    setName("");
    setPhoto(null);
    setPending((p) => [...p, entry]);
    inputRef.current?.focus();

    startTransition(async () => {
      const result = await addShoppingItem(trimmed);
      if (!result.ok) {
        setAdding(false);
        setPending((p) => p.filter((e) => e.key !== entry.key));
        toast(result.error, "error");
        setName((current) => current || trimmed); // give the text back
        setPhoto((current) => current ?? attached); // and the photo with it
        return;
      }

      // The item exists, so its photo has somewhere to go. A failure here
      // leaves a perfectly good entry that simply has no picture — which is
      // why every row keeps its own "add a photo" button.
      if (attached) {
        const upload = await uploadShoppingPhoto(result.itemId, attached.file);
        if (!upload.ok) toast(upload.message, "error");
      }

      setAdding(false);
      setPending((p) => p.filter((e) => e.key !== entry.key));
      if (attached) URL.revokeObjectURL(attached.previewUrl);
      router.refresh();
    });
  }

  function chooseComposePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be re-picked
    if (!file) return;
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  function clearComposePhoto() {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  /** Point the shared row file input at one item, then open the OS picker. */
  function pickPhotoFor(itemId: string) {
    photoTargetId.current = itemId;
    rowFileInput.current?.click();
  }

  async function chooseRowPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const itemId = photoTargetId.current;
    photoTargetId.current = null;
    if (!file || !itemId) return;

    setPhotoBusyId(itemId);
    const result = await uploadShoppingPhoto(itemId, file);
    setPhotoBusyId(null);
    if (result.ok) {
      toast("Photo added");
      router.refresh();
    } else {
      toast(result.message, "error");
    }
  }

  function removePhoto(itemId: string) {
    setPhotoBusyId(itemId);
    startTransition(async () => {
      const result = await removeShoppingPhoto(itemId);
      setPhotoBusyId(null);
      if (result.ok) {
        setViewingId(null);
        toast("Photo removed");
        router.refresh();
      } else {
        toast(result.error, "error");
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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Filtered against `open` (not just the raw Set) so a stale id left over
  // from a deleted item can't be sent to the server or inflate the count.
  const selected = open.filter((row) => selectedIds.has(row.id));

  function confirmSelected() {
    if (selected.length === 0 || confirming) return;
    setConfirming(true);
    startTransition(async () => {
      const result = await confirmPickedUp(selected.map((row) => row.id));
      setConfirming(false);
      if (result.ok) {
        toast(selected.length > 1 ? `Got it — ${selected.length} items` : "Got it");
        setSelectedIds(new Set());
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

  const canEdit = (row: Row) => row.requestedByMemberId === currentMemberId || isAdmin;

  // Looked up by id rather than held as a snapshot, so replacing the photo
  // swaps the picture under the open viewer instead of leaving a stale one.
  const viewing = [...open, ...pickedUp].find((row) => row.id === viewingId) ?? null;

  /** The 44px square at the end of a row: the photo, or the offer to add one. */
  function photoSlot(row: Row, { allowAdd }: { allowAdd: boolean }) {
    if (row.photoUrl) {
      return (
        <button
          type="button"
          onClick={() => setViewingId(row.id)}
          aria-label={`See the photo of ${row.name}`}
          className="tap h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle transition active:scale-95"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.photoUrl} alt="" className="h-full w-full object-cover" />
        </button>
      );
    }

    if (!allowAdd || !storageReady || !canEdit(row)) return null;

    return (
      <button
        type="button"
        onClick={() => pickPhotoFor(row.id)}
        disabled={photoBusyId === row.id}
        aria-label={`Add a photo to ${row.name}`}
        className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong text-muted transition-colors active:bg-subtle disabled:opacity-40"
      >
        <CameraGlyph className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="mb-6">
        <div className="flex gap-2">
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
        </div>

        {/* No `capture` attribute: that would send iOS straight to the camera,
            and half the time the clearest picture of a thing is one already in
            the camera roll — or a screenshot of the exact bottle. */}
        <input
          ref={composeFileInput}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={chooseComposePhoto}
          className="hidden"
        />

        {photo ? (
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-subtle p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
            <span className="min-w-0 flex-1 text-xs text-muted">
              Goes up with the item, so everyone can see which one you mean.
            </span>
            <button
              type="button"
              onClick={clearComposePhoto}
              className="tap shrink-0 px-2 text-xs font-bold text-muted transition-colors hover:text-clay"
            >
              Remove
            </button>
          </div>
        ) : storageReady ? (
          <button
            type="button"
            onClick={() => composeFileInput.current?.click()}
            className="tap mt-1 flex items-center gap-2 text-xs font-bold text-muted transition-colors active:text-ink"
          >
            <CameraGlyph className="h-4 w-4" />
            Add a photo
          </button>
        ) : null}
      </form>

      <input
        ref={rowFileInput}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={chooseRowPhoto}
        className="hidden"
      />

      {open.length === 0 && pending.length === 0 ? (
        <EmptyWell>Nothing needed from town. Enjoy it while it lasts.</EmptyWell>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line">
          {open.map((row) => (
            <li key={row.id} className="border-b border-line bg-card last:border-b-0">
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selectedIds.has(row.id)}
                  aria-label={selectedIds.has(row.id) ? `Deselect ${row.name}` : `Select ${row.name}`}
                  onClick={() => toggleSelected(row.id)}
                  className={`tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                    selectedIds.has(row.id)
                      ? "bg-ink text-paper"
                      : "border border-line-strong text-transparent active:bg-subtle"
                  }`}
                >
                  <Check />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-bold text-ink">{row.name}</p>
                  <p className="text-xs text-muted">
                    {photoBusyId === row.id ? (
                      "Adding photo…"
                    ) : (
                      <>
                        {row.requestedBy} ·{" "}
                        <RelativeTime
                          iso={row.createdAt}
                          initial={relativeTime(new Date(row.createdAt))}
                        />
                      </>
                    )}
                  </p>
                </div>
                {photoSlot(row, { allowAdd: true })}
                {canEdit(row) ? (
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
          {pending.map((entry) => (
            <li key={`pending-${entry.key}`} className="border-b border-line bg-card opacity-50 last:border-b-0">
              <div className="flex items-center gap-3 p-3">
                <div className="h-11 w-11 shrink-0 rounded-full border border-line-strong" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-bold text-ink">{entry.name}</p>
                  {entry.previewUrl ? <p className="text-xs text-muted">Adding photo…</p> : null}
                </div>
                {entry.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.previewUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg border border-line object-cover"
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 ? (
        <button
          type="button"
          onClick={confirmSelected}
          disabled={confirming}
          className="tap mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3.5 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.99] disabled:opacity-40"
        >
          {confirming ? "Marking…" : `Got it · ${selected.length}`}
        </button>
      ) : null}

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
                  {photoSlot(row, { allowAdd: false })}
                  {canEdit(row) ? (
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

      {viewing?.photoUrl ? (
        <ShoppingPhotoViewer
          name={viewing.name}
          photoUrl={viewing.photoUrl}
          canEdit={canEdit(viewing) && storageReady}
          busy={photoBusyId === viewing.id}
          onReplace={() => pickPhotoFor(viewing.id)}
          onRemove={() => removePhoto(viewing.id)}
          onClose={() => setViewingId(null)}
        />
      ) : null}
    </>
  );
}
