"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mealAssignments, meals, members, type Member } from "@/db/schema";
import { generateMealDescription, isAiConfigured } from "@/lib/ai/mealDescription";
import { requireMember } from "@/lib/auth/membership";
import { mealTitleSchema, uuidSchema } from "@/lib/validation/schemas";

export type ActionResult =
  /** `note` means the answer stands, but it wasn't yours — see `claim()`. */
  | { ok: true; note?: string }
  | { ok: false; error: string };

/** Narrower than `ActionResult` so the guard below can return it too. */
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function revalidate() {
  revalidatePath("/meals");
  revalidatePath("/");
}

type Guarded =
  | { ok: true; member: Member; meal: typeof meals.$inferSelect }
  | { ok: false; error: string };

/**
 * Meals are read-only to the house at large; only the people cooking one may
 * answer for it (spec §9.5). Admins are included because they own the
 * schedule, and someone has to be able to fix a meal whose cook is offline.
 */
async function guard(mealId: string): Promise<Guarded> {
  let member: Member;
  try {
    member = await requireMember();
  } catch {
    return fail("You're signed out. Sign in and try again.");
  }

  const parsed = uuidSchema.safeParse(mealId);
  if (!parsed.success) return fail("That meal isn't valid.");

  const [meal] = await db.select().from(meals).where(eq(meals.id, parsed.data)).limit(1);
  if (!meal) return fail("That meal is gone.");

  if (!member.isAdmin) {
    const assigned = await db
      .select({ memberId: mealAssignments.memberId })
      .from(mealAssignments)
      .where(eq(mealAssignments.mealId, meal.id));
    if (!assigned.some((a) => a.memberId === member.id)) {
      return fail("That's not your meal to change.");
    }
  }

  return { ok: true, member, meal };
}

/**
 * Answer for a meal, and only if nobody else has. Most meals here have two
 * cooks and both get the same prompt, so the write is conditional on the meal
 * still being unanswered: whoever taps first sets the answer, and the other
 * tap lands on `confirmedAt is not null` and changes nothing. Reading the row
 * first and then writing would let two simultaneous taps both pass the check.
 */
async function claim(
  meal: typeof meals.$inferSelect,
  member: Member,
  changes: Partial<typeof meals.$inferInsert>,
): Promise<ActionResult> {
  const claimed = await db
    .update(meals)
    .set({
      ...changes,
      confirmedAt: new Date(),
      confirmedByMemberId: member.id,
      updatedAt: new Date(),
    })
    .where(and(eq(meals.id, meal.id), isNull(meals.confirmedAt)))
    .returning({ id: meals.id });

  revalidate();
  if (claimed.length > 0) return { ok: true };

  // Somebody got there first. Say who, and what the meal ended up being —
  // they may have renamed it rather than simply confirming.
  const [answer] = await db
    .select({
      title: meals.title,
      byMemberId: meals.confirmedByMemberId,
      byName: members.displayName,
    })
    .from(meals)
    .leftJoin(members, eq(members.id, meals.confirmedByMemberId))
    .where(eq(meals.id, meal.id))
    .limit(1);

  // Their own second tap — a double-press or a stale tile. Nothing to report.
  if (!answer || answer.byMemberId === member.id) return { ok: true };

  return { ok: true, note: `${answer.byName ?? "Someone"} beat you to it — it's ${answer.title}.` };
}

/** "Yes, still making it." Leaves the meal exactly as the schedule has it. */
export async function confirmMeal(mealId: string): Promise<ActionResult> {
  const guarded = await guard(mealId);
  if (!guarded.ok) return guarded;

  try {
    return await claim(guarded.meal, guarded.member, {});
  } catch (error) {
    console.error("confirmMeal failed", error);
    return fail("Couldn't confirm that. Try again.");
  }
}

/**
 * "Actually, we're having something else." Renaming answers the prompt too —
 * telling us what you're cooking is a stronger confirmation than tapping yes.
 *
 * The seeded description and photo describe the old dish, so they go
 * immediately: a tasting-menu paragraph about pizza under the word "Tacos" is
 * worse than no paragraph at all. A new description is then regenerated for
 * the new title via runtime AI (spec §9.4) — off the response path, so a slow
 * or unconfigured model never blocks the rename itself.
 */
export async function updateMealTitle(mealId: string, title: string): Promise<ActionResult> {
  const guarded = await guard(mealId);
  if (!guarded.ok) return guarded;

  const parsed = mealTitleSchema.safeParse(title);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That name isn't valid.");
  }

  // Submitting the name unchanged is just a confirmation — don't throw away
  // the description and photo over a no-op edit.
  const renamed = parsed.data !== guarded.meal.title;
  const newTitle = parsed.data;

  try {
    const result = await claim(guarded.meal, guarded.member, {
      title: newTitle,
      ...(renamed ? { displayDescription: null, photoPath: null } : {}),
    });

    if (result.ok && renamed && isAiConfigured()) {
      after(async () => {
        const description = await generateMealDescription(newTitle);
        if (!description) return;
        // Guard against a second rename landing before this finishes — only
        // apply the prose if the title is still the one it was written for.
        await db
          .update(meals)
          .set({ displayDescription: description, updatedAt: new Date() })
          .where(and(eq(meals.id, mealId), eq(meals.title, newTitle)));
      });
    }

    return result;
  } catch (error) {
    console.error("updateMealTitle failed", error);
    return fail("Couldn't update that meal. Try again.");
  }
}
