/**
 * The per-button cool-off on the dogs screen. Not a server rule — the actions
 * accept any event at any time, on purpose, because a real second walk ten
 * minutes later still needs recording from another phone. This just stops the
 * one thing that actually happens: a fat-fingered double tap.
 */
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * A button is locked while its own last event is still fresh. The window runs
 * from *when the thing happened*, not when it was tapped — correct "Fed" back
 * to three hours ago in the history sheet and the button reopens, because by
 * that reading the dog is due. Deleting the event reopens it for the same
 * reason, and so does an event nobody has recorded yet.
 */
export function isLockedOut(occurredAt: string | Date | null | undefined, now: number): boolean {
  if (!occurredAt) return false;
  const at = (typeof occurredAt === "string" ? new Date(occurredAt) : occurredAt).getTime();
  if (Number.isNaN(at)) return false;
  return at + LOCKOUT_MS > now;
}
