import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, gt, isNotNull, isNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members, shoppingItems, type Member, type ShoppingItem } from "@/db/schema";
import { presignView } from "@/lib/storage/s3";

export type ShoppingRow = {
  id: string;
  name: string;
  createdAt: Date;
  requestedBy: string;
  requestedByMemberId: string;
  pickedUpAt: Date | null;
  pickedUpBy: string | null;
  photoKey: string | null;
};

/** A row ready for the screen: the photo resolved to a URL a browser can load. */
export type ShoppingCard = ShoppingRow & { photoUrl: string | null };

const picker = alias(members, "picker");

function baseQuery() {
  return db
    .select({
      id: shoppingItems.id,
      name: shoppingItems.name,
      createdAt: shoppingItems.createdAt,
      requestedBy: members.displayName,
      requestedByMemberId: shoppingItems.requestedByMemberId,
      pickedUpAt: shoppingItems.pickedUpAt,
      pickedUpBy: picker.displayName,
      photoKey: shoppingItems.photoKey,
    })
    .from(shoppingItems)
    .innerJoin(members, eq(members.id, shoppingItems.requestedByMemberId))
    .leftJoin(picker, eq(picker.id, shoppingItems.pickedUpByMemberId));
}

export async function getOpenShoppingItems(limit?: number): Promise<ShoppingRow[]> {
  const query = baseQuery()
    .where(isNull(shoppingItems.pickedUpAt))
    .orderBy(asc(shoppingItems.createdAt));
  return limit ? query.limit(limit) : query;
}

export async function getPickedUpShoppingItems(limit = 50): Promise<ShoppingRow[]> {
  return baseQuery()
    .where(isNotNull(shoppingItems.pickedUpAt))
    .orderBy(desc(shoppingItems.pickedUpAt))
    .limit(limit);
}

/**
 * Attach a short-lived presigned URL to every row that has a photo, same
 * pattern as {@link import("./feedPosts").withPostThumbnailUrls}. The bucket
 * is private, so this is the only way the bytes reach a browser.
 */
export async function withShoppingPhotoUrls(rows: ShoppingRow[]): Promise<ShoppingCard[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      photoUrl: row.photoKey ? await presignView(row.photoKey).catch(() => null) : null,
    })),
  );
}

/** The raw row, for the paths that must check ownership before writing. */
export async function getShoppingItemById(itemId: string): Promise<ShoppingItem | null> {
  const [row] = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.id, itemId))
    .limit(1);
  return row ?? null;
}

/**
 * Who may change an item rather than just tick it off: the person who asked
 * for it, or an admin (spec §11.4). Deleting it and attaching a photo to it
 * are the same question, so they ask it in the same place.
 */
export function canEditShoppingItem(
  item: Pick<ShoppingItem, "requestedByMemberId">,
  member: Pick<Member, "id" | "isAdmin">,
): boolean {
  return item.requestedByMemberId === member.id || member.isAdmin;
}

export async function countOpenShoppingItems(): Promise<number> {
  const rows = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(isNull(shoppingItems.pickedUpAt));
  return rows.length;
}

export type PickupActivity = {
  pickedUpAt: Date;
  pickedUpBy: string;
  items: string[];
};

/**
 * Recent town runs, for the Home activity tile. A "Got it" batch confirm
 * writes one shared timestamp across every item it touches, so grouping by
 * (picker, exact timestamp) recovers each trip as a single entry — no
 * separate activity-log table needed (spec §43).
 */
export async function getRecentPickupActivity(
  windowHours = 24,
  limit = 3,
): Promise<PickupActivity[]> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const rows = await baseQuery()
    .where(and(isNotNull(shoppingItems.pickedUpAt), gt(shoppingItems.pickedUpAt, cutoff)))
    .orderBy(desc(shoppingItems.pickedUpAt));

  const groups = new Map<string, PickupActivity>();
  const order: string[] = [];
  for (const row of rows) {
    if (!row.pickedUpAt || !row.pickedUpBy) continue;
    const key = `${row.pickedUpBy}:${row.pickedUpAt.getTime()}`;
    let group = groups.get(key);
    if (!group) {
      group = { pickedUpAt: row.pickedUpAt, pickedUpBy: row.pickedUpBy, items: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.items.push(row.name);
  }
  return order.slice(0, limit).map((key) => groups.get(key)!);
}
