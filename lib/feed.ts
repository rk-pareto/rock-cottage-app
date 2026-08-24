/**
 * Home-feed assembly (spec §8.1). Meals are the spine of the feed; photos are
 * dropped in between them as a random selection, not a timeline — the meals
 * look forward and the photos look back, so they're deliberately unrelated.
 *
 * Pure on purpose: the page fetches the rows, this decides the arrangement.
 */

export type FeedItem<M, P> =
  { kind: "meal"; meal: M } | { kind: "photo"; photo: P };

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
export function photoDrawSeed(now: Date = new Date()): string {
  return String(Math.floor(now.getTime() / 3_600_000));
}

/** How many photos to weave into a feed carrying `mealCount` meals. */
export function photoDrawCount(mealCount: number, every = 2): number {
  return Math.min(3, Math.max(1, Math.floor(mealCount / every)));
}

/**
 * Deal photos into the meal stack — one after every `every` meals, so no card
 * sits alone and the feed keeps a rhythm. Leftover photos (a short meal
 * schedule, or none at all) go on the end rather than being dropped.
 */
export function interleaveFeed<M, P>(
  meals: M[],
  photos: P[],
  every = 2,
): FeedItem<M, P>[] {
  const items: FeedItem<M, P>[] = [];
  let next = 0;

  meals.forEach((meal, index) => {
    items.push({ kind: "meal", meal });
    if ((index + 1) % every === 0 && next < photos.length) {
      items.push({ kind: "photo", photo: photos[next++] });
    }
  });

  for (; next < photos.length; next++)
    items.push({ kind: "photo", photo: photos[next] });
  return items;
}
