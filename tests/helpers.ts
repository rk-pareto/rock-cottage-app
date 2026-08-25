import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bringingItems,
  mealAssignments,
  meals,
  media,
  members,
  petEvents,
  shoppingItems,
} from "@/db/schema";
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
  await db.delete(media).where(inArray(media.uploadedByMemberId, ids));
  await db.delete(bringingItems).where(inArray(bringingItems.responsibleMemberId, ids));
  await db.delete(shoppingItems).where(inArray(shoppingItems.requestedByMemberId, ids));
  await db.delete(mealAssignments).where(inArray(mealAssignments.memberId, ids));
  for (const id of ids) {
    await db.delete(shoppingItems).where(eq(shoppingItems.pickedUpByMemberId, id));
    // meals.confirmed_by_member_id is ON DELETE RESTRICT, so hand any meal a
    // test member confirmed back to its unconfirmed state before they go.
    await db
      .update(meals)
      .set({ confirmedAt: null, confirmedByMemberId: null })
      .where(eq(meals.confirmedByMemberId, id));
    await db.delete(members).where(eq(members.id, id));
  }
}
