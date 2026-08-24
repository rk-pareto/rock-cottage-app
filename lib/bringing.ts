import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bringingItems, members } from "@/db/schema";

export type BringingRow = {
  id: string;
  name: string;
  category: string | null;
  notes: string | null;
  responsibleMemberId: string;
  responsibleBy: string;
  packedAt: Date | null;
};

export async function getBringingItems(): Promise<BringingRow[]> {
  return db
    .select({
      id: bringingItems.id,
      name: bringingItems.name,
      category: bringingItems.category,
      notes: bringingItems.notes,
      responsibleMemberId: bringingItems.responsibleMemberId,
      responsibleBy: members.displayName,
      packedAt: bringingItems.packedAt,
    })
    .from(bringingItems)
    .innerJoin(members, eq(members.id, bringingItems.responsibleMemberId))
    .orderBy(asc(bringingItems.category), asc(bringingItems.name));
}
