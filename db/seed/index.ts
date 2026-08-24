import "../load-env";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mealAssignments, meals, members, pets } from "@/db/schema";
import { MEALS, MEMBERS, PETS } from "./data";

const MEAL_TYPE_ORDER: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3 };

/**
 * Idempotent production seed (spec §26). Re-running must not duplicate
 * members, pets, meals or assignments. Natural keys: member email, pet slug,
 * and meal (date + type + title).
 *
 * Note this never touches shopping, dog events, memories or bringing — those are
 * live user data.
 */
async function seed() {
  console.log("Seeding Rock Cottage…");

  // --- Members -------------------------------------------------------------
  for (const m of MEMBERS) {
    await db
      .insert(members)
      .values({
        email: m.email.toLowerCase(),
        displayName: m.displayName,
        isAdmin: m.isAdmin,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: members.email,
        // Deliberately does not touch auth_user_id or is_active — re-seeding
        // must not unbind a logged-in member or resurrect a deactivated one.
        set: { displayName: m.displayName, isAdmin: m.isAdmin, updatedAt: new Date() },
      });
  }
  console.log(`  members: ${MEMBERS.length}`);

  // --- Pets ----------------------------------------------------------------
  for (const p of PETS) {
    await db
      .insert(pets)
      .values(p)
      .onConflictDoUpdate({
        target: pets.slug,
        set: { name: p.name, sortOrder: p.sortOrder },
      });
  }
  console.log(`  pets: ${PETS.length}`);

  // --- Meals ---------------------------------------------------------------
  const memberRows = await db.select().from(members);
  const memberIdByEmail = new Map(memberRows.map((r) => [r.email, r.id]));

  let assignmentCount = 0;
  for (const meal of MEALS) {
    const [row] = await db
      .insert(meals)
      .values({
        mealDate: meal.mealDate,
        mealType: meal.mealType,
        title: meal.title,
        displayDescription: meal.displayDescription,
        practicalNotes: meal.practicalNotes ?? null,
        photoPath: meal.photo ?? null,
        sortOrder: MEAL_TYPE_ORDER[meal.mealType] ?? 0,
      })
      .onConflictDoUpdate({
        target: [meals.mealDate, meals.mealType, meals.title],
        set: {
          displayDescription: meal.displayDescription,
          practicalNotes: meal.practicalNotes ?? null,
          photoPath: meal.photo ?? null,
          sortOrder: MEAL_TYPE_ORDER[meal.mealType] ?? 0,
          updatedAt: new Date(),
        },
      })
      .returning({ id: meals.id });

    if (!row) continue;

    // Assignments are declared wholly by the seed: replace, don't accumulate.
    const wantedIds = meal.responsible
      .map((email) => memberIdByEmail.get(email.toLowerCase()))
      .filter((id): id is string => Boolean(id));

    await db.delete(mealAssignments).where(eq(mealAssignments.mealId, row.id));
    if (wantedIds.length > 0) {
      await db
        .insert(mealAssignments)
        .values(wantedIds.map((memberId) => ({ mealId: row.id, memberId })))
        .onConflictDoNothing();
      assignmentCount += wantedIds.length;
    }
  }
  console.log(`  meals: ${MEALS.length}  ·  assignments: ${assignmentCount}`);

  const unknown = MEALS.flatMap((m) => m.responsible).filter(
    (e) => !memberIdByEmail.has(e.toLowerCase()),
  );
  if (unknown.length > 0) {
    console.warn(`  WARNING: unknown responsible emails: ${[...new Set(unknown)].join(", ")}`);
  }

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });

