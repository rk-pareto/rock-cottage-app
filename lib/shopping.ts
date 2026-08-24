import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, isNotNull, isNull } from "drizzle-orm";
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
