import "server-only";
import { asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { mealAssignments, meals, members } from "@/db/schema";
import { addDays, cottageToday, mealStartAt } from "@/lib/time";

export type MealRow = {
  id: string;
  mealDate: string;
  mealType: string;
  title: string;
  displayDescription: string | null;
  practicalNotes: string | null;
  photoPath: string | null;
  confirmedAt: Date | null;
  responsible: string[];
  /** Ids behind `responsible` — the only thing that decides who gets asked. */
  responsibleMemberIds: string[];
};

/**
 * How long before service the owner gets asked (spec §9.5). 22 hours rather
 * than a round day so the prompt lands just after the equivalent meal the day
 * before — you're asked about tomorrow's dinner while tonight's is settling.
 */
export const CONFIRMATION_LEAD_MS = 22 * 60 * 60 * 1000;

async function withAssignments(rows: (typeof meals.$inferSelect)[]): Promise<MealRow[]> {
  if (rows.length === 0) return [];

  const assignments = await db
    .select({
      mealId: mealAssignments.mealId,
      memberId: mealAssignments.memberId,
      displayName: members.displayName,
    })
    .from(mealAssignments)
    .innerJoin(members, eq(members.id, mealAssignments.memberId));

  const byMeal = new Map<string, { memberId: string; displayName: string }[]>();
  for (const a of assignments) {
    const list = byMeal.get(a.mealId) ?? [];
    list.push({ memberId: a.memberId, displayName: a.displayName });
    byMeal.set(a.mealId, list);
  }

  return rows.map((row) => {
    const assigned = (byMeal.get(row.id) ?? []).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
    return {
      id: row.id,
      mealDate: row.mealDate,
      mealType: row.mealType,
      title: row.title,
      displayDescription: row.displayDescription,
      practicalNotes: row.practicalNotes,
      photoPath: row.photoPath,
      confirmedAt: row.confirmedAt,
      responsible: assigned.map((a) => a.displayName),
      responsibleMemberIds: assigned.map((a) => a.memberId),
    };
  });
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

/** The fields that decide whether a meal is still waiting on its owner. */
export type ConfirmableMeal = Pick<
  MealRow,
  "mealDate" | "mealType" | "confirmedAt" | "responsibleMemberIds"
>;

/**
 * Is this member being asked about this meal right now? True only inside the
 * window that opens `CONFIRMATION_LEAD_MS` before service and closes when the
 * food is served — after that the answer is on the table, not in the app.
 *
 * Meals nobody owns ("Everyone") are never asked about: there is no one to
 * ask, and prompting all five would just produce five taps for one answer.
 */
export function awaitsConfirmation(
  meal: ConfirmableMeal,
  memberId: string,
  now: Date = new Date(),
): boolean {
  if (meal.confirmedAt) return false;
  if (!meal.responsibleMemberIds.includes(memberId)) return false;

  const servedAt = mealStartAt(meal.mealDate, meal.mealType).getTime();
  if (Number.isNaN(servedAt)) return false;

  const at = now.getTime();
  return at >= servedAt - CONFIRMATION_LEAD_MS && at < servedAt;
}

/**
 * The confirmation prompts to show this member, soonest first. Scanning from
 * yesterday covers a meal whose window opened the previous calendar day.
 */
export async function getMealsAwaitingConfirmation(
  memberId: string,
  now: Date = new Date(),
): Promise<MealRow[]> {
  const rows = await db
    .select()
    .from(meals)
    .where(gte(meals.mealDate, addDays(cottageToday(now), -1)))
    .orderBy(asc(meals.mealDate), asc(meals.sortOrder), asc(meals.title));

  const withNames = await withAssignments(rows);
  return withNames.filter((meal) => awaitsConfirmation(meal, memberId, now));
}
