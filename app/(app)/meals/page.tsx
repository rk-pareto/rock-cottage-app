import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/Card";
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
      <PageHeader title="Meals" subtitle="Aug 31 – Sep 6 · Rock Cut Cottage" />

      {groups.length === 0 ? (
        <p className="text-sm text-muted">No meals have been seeded yet.</p>
      ) : (
        <div className="flex flex-col gap-9">
          {groups.map((group) => {
            const isToday = group.date === today;
            return (
              <section key={group.date}>
                {/* The date sticks while its meals scroll — the week stays
                    legible on a phone without a second navigation layer. */}
                <div className="sticky top-0 z-10 -mx-4 mb-3 bg-paper/90 px-4 py-2 backdrop-blur">
                  <h2 className="flex items-center gap-3">
                    <span
                      className={`shrink-0 text-sm font-extrabold tracking-tight ${isToday ? "text-ink" : "text-ink-soft"}`}
                    >
                      {formatLongDate(group.date)}
                    </span>
                    <span aria-hidden="true" className="h-px flex-1 bg-line" />
                    {isToday ? (
                      <span className="label shrink-0 rounded-full bg-ink px-2 py-1 text-paper">
                        Today
                      </span>
                    ) : null}
                  </h2>
                </div>
                <div className="flex flex-col gap-3">
                  {group.meals.map((meal) => (
                    <MealCard key={meal.id} meal={meal} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function MealCard({ meal }: { meal: MealRow }) {
  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <p className="label text-muted">{TYPE_LABEL[meal.mealType] ?? meal.mealType}</p>
      <h3 className="mt-2 font-display text-[1.5rem] leading-tight text-ink">{meal.title}</h3>
      {meal.displayDescription ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{meal.displayDescription}</p>
      ) : null}
      <p className="mt-3 border-t border-line pt-2.5 text-sm">
        <span className="text-muted">Cooking</span>{" "}
        <span className="font-bold text-ink">
          {meal.responsible.length > 0 ? meal.responsible.join(" & ") : "Everyone"}
        </span>
      </p>
      {meal.practicalNotes ? (
        <p className="mt-3 rounded-xl bg-subtle px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
          {meal.practicalNotes}
        </p>
      ) : null}
    </article>
  );
}
