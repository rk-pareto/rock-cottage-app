import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bringingItems, members, petEvents, photos, shoppingItems } from "@/db/schema";
import type { Member } from "@/db/schema";

/** Distinct from the seeded cottage members so tests never disturb real rows. */
export async function createTestMember(
  suffix: string,
  overrides: Partial<Member> = {},
): Promise<Member> {
  const email = `test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const [row] = await db
    .insert(members)
    .values({
      email,
      displayName: `Test ${suffix}`,
      isAdmin: false,
      isActive: true,
      ...overrides,
    })
    .returning();
  return row!;
}

/** Remove test members and everything attributed to them. */
export async function cleanupMembers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(petEvents).where(inArray(petEvents.recordedByMemberId, ids));
  await db.delete(photos).where(inArray(photos.uploadedByMemberId, ids));
  await db.delete(bringingItems).where(inArray(bringingItems.responsibleMemberId, ids));
  await db.delete(shoppingItems).where(inArray(shoppingItems.requestedByMemberId, ids));
  for (const id of ids) {
    await db.delete(shoppingItems).where(eq(shoppingItems.pickedUpByMemberId, id));
    await db.delete(members).where(eq(members.id, id));
  }
}
