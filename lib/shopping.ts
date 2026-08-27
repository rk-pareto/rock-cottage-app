import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, gt, isNotNull, isNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members, shoppingItems } from "@/db/schema";

export type ShoppingRow = {
  id: string;
  name: string;
  createdAt: Date;
  requestedBy: string;
  requestedByMemberId: string;
  pickedUpAt: Date | null;
  pickedUpBy: string | null;
};

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
