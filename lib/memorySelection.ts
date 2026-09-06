/**
 * The rules behind bulk select on `/memories`.
 *
 * All of it turns on one distinction — whose upload is this — and all of it is
 * off-by-one territory: an "all" that quietly means "all but one", a "not
 * mine" that matches when you have uploaded nothing, a confirmation that never
 * fires. Pure and separate from the component for the same reason
 * `placeholderLabel` is.
 */

export type SelectScope = "all" | "others" | "none";

/** Everything these rules need to know about a memory. */
export type Selectable = { uploadedByMemberId: string };

/**
 * The one-tap selections, in the order they sit in the pill group. "Not mine"
 * is the one people want at the end of a week: your own photos are already in
 * your camera roll, so downloading them again is a slow copy of a file you
 * have — and for a week of 4K clips, most of the archive.
 */
export const SELECT_SCOPES: { value: SelectScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "others", label: "Not mine" },
  { value: "none", label: "None" },
];

/** Split a list by whether the current member is the one who uploaded it. */
export function partitionByUploader<T extends Selectable>(
  memories: T[],
  memberId: string,
): { own: T[]; others: T[] } {
  const own: T[] = [];
  const others: T[] = [];
  for (const memory of memories) {
    (memory.uploadedByMemberId === memberId ? own : others).push(memory);
  }
  return { own, others };
}

/** What a scope selects out of what is currently on screen. */
export function scopeMemories<T extends Selectable>(
  memories: T[],
  scope: SelectScope,
  memberId: string,
): T[] {
  if (scope === "none") return [];
  if (scope === "all") return memories;
  return partitionByUploader(memories, memberId).others;
}

/**
 * Whether "Not mine" is worth offering: with no uploads of your own on screen
 * it is "All" under another name, and with nothing *but* your own it selects
 * nothing at all.
 */
export function canSkipOwn<T extends Selectable>(memories: T[], memberId: string): boolean {
  const { own, others } = partitionByUploader(memories, memberId);
  return own.length > 0 && others.length > 0;
}

/**
 * Which scope the current selection happens to match, if any — so the pills
 * read as a state rather than as three buttons that forget what you pressed.
 * `selected` is assumed to be a subset of `selectable`, which is how the grid
 * builds it.
 *
 * "All" is checked before "not mine" so that a member who has uploaded nothing
 * — for whom the two are the same set — sees the plainer of the two.
 */
export function matchedScope<T extends Selectable>(
  selected: T[],
  selectable: T[],
  memberId: string,
): SelectScope | null {
  if (selected.length === 0) return "none";
  if (selected.length === selectable.length) return "all";
  const others = scopeMemories(selectable, "others", memberId);
  const isEveryOther =
    selected.length === others.length &&
    selected.every((memory) => memory.uploadedByMemberId !== memberId);
  return isEveryOther ? "others" : null;
}
