/**
 * Home-feed assembly (spec §8.1). Meals are the spine of the feed; memories
 * are dropped in between them as a random selection, not a timeline — the
 * meals look forward and the memories look back, so they're deliberately
 * unrelated.
 *
 * Pure on purpose: the page fetches the rows, this decides the arrangement.
 */

import type { StayEvent } from "@/lib/stay";

export type FeedItem<M, P> =
  { kind: "meal"; meal: M } | { kind: "memory"; memory: P };

/** A feed item, plus the arrival/departure tile {@link withStayEvents} adds. */
export type FeedItemWithStay<M, P> =
  FeedItem<M, P> | { kind: "stay"; stay: StayEvent };

/** xmur3: string → 32-bit seed. */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for shuffling holiday snaps. */
function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded Fisher–Yates draw: same seed, same pictures, same order. */
export function pickSeeded<T>(items: T[], count: number, seed: string): T[] {
  if (count <= 0 || items.length === 0) return [];
  const pool = [...items];
  const random = seededRandom(seed);
  const take = Math.min(count, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

/**
 * A seed that holds still for an hour. Home re-renders every 30 seconds
 * (spec §8.2) and a fresh draw each time would make the page flicker, so the
 * selection only turns over on the hour.
 */
export function memoryDrawSeed(now: Date = new Date()): string {
  return String(Math.floor(now.getTime() / 3_600_000));
}

/** How many memories to weave into a feed carrying `mealCount` meals. */
export function memoryDrawCount(mealCount: number, every = 2): number {
  return Math.min(3, Math.max(1, Math.floor(mealCount / every)));
}

/**
 * Deal memories into the meal stack — one after every `every` meals, so no
 * card sits alone and the feed keeps a rhythm. Leftover memories (a short
 * meal schedule, or none at all) go on the end rather than being dropped.
 */
export function interleaveFeed<M, P>(
  meals: M[],
  memories: P[],
  every = 2,
): FeedItem<M, P>[] {
  const items: FeedItem<M, P>[] = [];
  let next = 0;

  meals.forEach((meal, index) => {
    items.push({ kind: "meal", meal });
    if ((index + 1) % every === 0 && next < memories.length) {
      items.push({ kind: "memory", memory: memories[next++] });
    }
  });

  for (; next < memories.length; next++)
    items.push({ kind: "memory", memory: memories[next] });
  return items;
}

/**
 * Drops arrival/departure tiles into an already-interleaved feed, ahead of
 * that date's first meal — you learn when you're checking in before you
 * learn what's for dinner. A day with no meals in the feed still gets its
 * tile, pinned to the front rather than dropped.
 */
export function withStayEvents<M extends { mealDate: string }, P>(
  feed: FeedItem<M, P>[],
  events: StayEvent[],
): FeedItemWithStay<M, P>[] {
  if (events.length === 0) return feed;
  const items: FeedItemWithStay<M, P>[] = [...feed];
  // Furthest-out date first so an earlier insertion doesn't shift the index
  // an already-placed later one was found at.
  for (const event of [...events].sort((a, b) =>
    b.date.localeCompare(a.date),
  )) {
    const index = items.findIndex(
      (item) => item.kind === "meal" && item.meal.mealDate === event.date,
    );
    items.splice(index === -1 ? 0 : index, 0, { kind: "stay", stay: event });
  }
  return items;
}
