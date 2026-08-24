import "server-only";
import { asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { mealAssignments, meals, members } from "@/db/schema";
import { cottageToday } from "@/lib/time";

export type MealRow = {
  id: string;
  mealDate: string;
  mealType: string;
  title: string;
  displayDescription: string | null;
  practicalNotes: string | null;
  responsible: string[];
};

async function withAssignments(rows: (typeof meals.$inferSelect)[]): Promise<MealRow[]> {
  if (rows.length === 0) return [];

  const assignments = await db
    .select({
      mealId: mealAssignments.mealId,
      displayName: members.displayName,
    })
    .from(mealAssignments)
    .innerJoin(members, eq(members.id, mealAssignments.memberId));

  const byMeal = new Map<string, string[]>();
  for (const a of assignments) {
    const list = byMeal.get(a.mealId) ?? [];
    list.push(a.displayName);
    byMeal.set(a.mealId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    mealDate: row.mealDate,
    mealType: row.mealType,
    title: row.title,
    displayDescription: row.displayDescription,
    practicalNotes: row.practicalNotes,
    responsible: (byMeal.get(row.id) ?? []).sort(),
  }));
}

/** Every meal, chronological (spec §9.1). */
export async function getAllMeals(): Promise<MealRow[]> {
  const rows = await db
    .select()
    .from(meals)
    .orderBy(asc(meals.mealDate), asc(meals.sortOrder), asc(meals.title));
  return withAssignments(rows);
}

/**
 * What's coming next: the rest of today plus tomorrow (spec §8.1). "Rest of
 * today" is by calendar date, not clock — a lunch you already ate still tells
 * you what the day looks like.
 */
export async function getUpcomingMeals(limit = 6): Promise<MealRow[]> {
  const today = cottageToday();
  const rows = await db
    .select()
    .from(meals)
    .where(gte(meals.mealDate, today))
    .orderBy(asc(meals.mealDate), asc(meals.sortOrder), asc(meals.title))
    .limit(limit);
  return withAssignments(rows);
}

export function groupByDate(rows: MealRow[]): { date: string; meals: MealRow[] }[] {
  const groups: { date: string; meals: MealRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.mealDate) last.meals.push(row);
    else groups.push({ date: row.mealDate, meals: [row] });
  }
  return groups;
}
