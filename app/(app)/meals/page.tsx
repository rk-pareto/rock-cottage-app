import type { Metadata } from "next";
import { getAllMeals, groupByDate, type MealRow } from "@/lib/meals";
import { requireMember } from "@/lib/auth/membership";
import { cottageToday, formatLongDate } from "@/lib/time";

export const metadata: Metadata = { title: "Meals · Rock Cottage" };

const TYPE_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export default async function MealsPage() {
  await requireMember();
  const groups = groupByDate(await getAllMeals());
  const today = cottageToday();

  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Meals</h1>
      <p className="mb-6 text-sm text-muted">Aug 31 – Sep 6 · Rock Cut Cottage</p>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">No meals have been seeded yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.date}>
              <h2 className="mb-3 flex items-baseline gap-2 font-display text-xl font-semibold text-ink">
                {formatLongDate(group.date)}
                {group.date === today ? (
                  <span className="rounded-full bg-amber px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                    Today
                  </span>
                ) : null}
              </h2>
              <div className="flex flex-col gap-3">
                {group.meals.map((meal) => (
                  <MealCard key={meal.id} meal={meal} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function MealCard({ meal }: { meal: MealRow }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-amber">
        {TYPE_LABEL[meal.mealType] ?? meal.mealType}
      </p>
      <h3 className="mt-0.5 font-display text-lg font-semibold text-ink">{meal.title}</h3>
      {meal.displayDescription ? (
        <p className="mt-2 text-sm leading-relaxed text-muted italic">
          {meal.displayDescription}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-ink">
        <span className="font-bold">Responsible:</span>{" "}
        {meal.responsible.length > 0 ? meal.responsible.join(" & ") : "Everyone"}
      </p>
      {meal.practicalNotes ? (
        <p className="mt-2 rounded-2xl bg-paper px-3 py-2 text-xs leading-relaxed text-muted">
          {meal.practicalNotes}
        </p>
      ) : null}
    </article>
  );
}
