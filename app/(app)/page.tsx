import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmedBadge } from "@/components/meals/ConfirmedBadge";
import { MealConfirmPrompt } from "@/components/meals/MealConfirmPrompt";
import { Card, EmptyState, SectionLabel } from "@/components/ui/Card";
import { PlayGlyph } from "@/components/ui/icons";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { requireMember } from "@/lib/auth/membership";
import { getDogStatuses } from "@/lib/dogs";
import { interleaveFeed, memoryDrawCount, memoryDrawSeed, pickSeeded } from "@/lib/feed";
import {
  getMealsAwaitingConfirmation,
  getUpcomingMeals,
  type MealRow,
} from "@/lib/meals";
import {
  formatDuration,
  getReadyMemories,
  withThumbnailUrls,
  type MemoryCard,
} from "@/lib/memories";
import { getOpenShoppingItems } from "@/lib/shopping";
import { isStorageConfigured } from "@/lib/storage/s3";
import {
  addDays,
  cottageToday,
  formatClock,
  formatWeekday,
  formatLongDate,
  mealStartAt,
  relativeTime,
} from "@/lib/time";
import type { PetEventType } from "@/db/schema";

export const metadata: Metadata = { title: "Rock Cottage" };

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const DOG_LABEL: Record<PetEventType, string> = {
  outside: "Outside",
  poop: "Poop",
  fed: "Fed",
};

/** The draw pool — wide enough that the selection feels random, small enough
 *  to stay one cheap query. */
const MEMORY_POOL = 60;

export default async function HomePage() {
  const member = await requireMember();
  const storageReady = isStorageConfigured();

  // Home queries the source tables directly — no activity-feed system (spec §43).
  const [meals, confirmations, dogs, shopping, memoryPool] = await Promise.all([
    getUpcomingMeals(5),
    getMealsAwaitingConfirmation(member.id),
    getDogStatuses(),
    getOpenShoppingItems(),
    storageReady ? getReadyMemories(MEMORY_POOL) : Promise.resolve([]),
  ]);

  // Only the drawn memories get presigned URLs — no point signing the pool.
  const drawn = pickSeeded(memoryPool, memoryDrawCount(meals.length), memoryDrawSeed());
  const memories = drawn.length > 0 ? await withThumbnailUrls(drawn) : [];
  const feed = interleaveFeed(meals, memories);
  const today = cottageToday();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-line pb-5">
        <p className="label text-muted">{formatLongDate(today)}</p>
        <h1 className="mt-2 font-display text-[2.25rem] leading-[1.05] text-ink">
          Hey {member.displayName}
        </h1>
      </header>

      {/* Above "Coming up" because it's the one thing here that wants an
          answer rather than a glance. It disappears once given. */}
      {confirmations.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>
            {confirmations.length > 1 ? "Your meals" : "Your meal"}
          </SectionLabel>
          {confirmations.map((meal) => (
            <MealConfirmPrompt
              key={meal.id}
              meal={{
                id: meal.id,
                title: meal.title,
                when: promptWhen(meal, today),
                sharedWith: coCooks(meal, member.id),
              }}
            />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionLabel href="/meals">Coming up</SectionLabel>

        {feed.length === 0 ? (
          <Card>
            <EmptyState>No meals left on the schedule. Leftovers it is.</EmptyState>
          </Card>
        ) : (
          feed.map((item) =>
            item.kind === "meal" ? (
              <UpcomingMealCard key={`meal-${item.meal.id}`} meal={item.meal} today={today} />
            ) : (
              <MemoryBreak key={`memory-${item.memory.id}`} memory={item.memory} />
            ),
          )
        )}
      </section>

      {dogs.map((dog) => (
        <section key={dog.id} className="flex flex-col gap-3">
          <SectionLabel href="/dogs" action="Open">
            {dog.name}
          </SectionLabel>
          {/* A ledger, not a card: label left, value right, hairline between. */}
          <ul className="flex flex-col">
            {(["outside", "poop", "fed"] as PetEventType[]).map((type) => {
              const event = dog.latest[type];
              return (
                <li
                  key={type}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-b-0"
                >
                  <span className="text-sm font-bold text-ink">{DOG_LABEL[type]}</span>
                  {event ? (
                    <span className="text-sm text-muted">
                      <span className="font-semibold text-ink-soft">
                        <RelativeTime
                          iso={event.occurredAt.toISOString()}
                          initial={relativeTime(event.occurredAt)}
                        />
                      </span>
                      {" · "}
                      {event.recordedBy}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">Nothing recorded yet</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <SectionLabel href="/shopping">
          {shopping.length > 0 ? `Need from town · ${shopping.length}` : "Shopping"}
        </SectionLabel>
        {shopping.length === 0 ? (
          <EmptyState>Nothing needed from town.</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {shopping.slice(0, 5).map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
              >
                <span className="min-w-0 truncate text-sm font-bold text-ink">{item.name}</span>
                <span className="shrink-0 text-sm text-muted">{item.requestedBy}</span>
              </li>
            ))}
            {shopping.length > 5 ? (
              <li className="pt-2.5 text-sm text-muted">+ {shopping.length - 5} more</li>
            ) : null}
          </ul>
        )}
      </section>

      {/* Memories are woven into the feed above; this covers the case where
          there were none to weave in. */}
      {memories.length === 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel href="/memories" action="View all">
            Memories
          </SectionLabel>
          <EmptyState>
            {storageReady
              ? "Nothing here yet. Someone go take a picture of the lake."
              : "Memory storage isn't set up yet."}
          </EmptyState>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The other people down to cook this meal, so the prompt can say the answer is
 * shared. `responsible` and `responsibleMemberIds` come off the same sorted
 * list, so they line up by index.
 */
function coCooks(meal: MealRow, memberId: string): string | undefined {
  const others = meal.responsible.filter((_, i) => meal.responsibleMemberIds[i] !== memberId);
  return others.length > 0 ? others.join(" & ") : undefined;
}

/** "Tomorrow · Dinner · 5:00 PM" — formatted here so the phone's own timezone
 *  never gets a vote in what the prompt says. */
function promptWhen(meal: MealRow, today: string): string {
  const day =
    meal.mealDate === today
      ? "Today"
      : meal.mealDate === addDays(today, 1)
        ? "Tomorrow"
        : formatWeekday(meal.mealDate);
  const type = MEAL_LABEL[meal.mealType] ?? meal.mealType;
  return `${day} · ${type} · ${formatClock(mealStartAt(meal.mealDate, meal.mealType))}`;
}

function UpcomingMealCard({ meal, today }: { meal: MealRow; today: string }) {
  const isToday = meal.mealDate === today;
  const day = isToday ? "Today" : formatLongDate(meal.mealDate).split(",")[0];

  return (
    <Link
      href="/meals"
      className="block overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_1px_rgba(14,18,22,0.03)] transition-colors active:bg-subtle"
    >
      {meal.photoPath ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/${meal.photoPath}`}
            alt={meal.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <div className="p-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`label ${isToday ? "text-ink" : "text-muted"}`}>{day}</span>
          <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
          <span className="label text-muted">
            {MEAL_LABEL[meal.mealType] ?? meal.mealType}
          </span>
          {meal.confirmedAt ? (
            <>
              <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
              <ConfirmedBadge />
            </>
          ) : null}
        </p>
        <h3 className="mt-2 font-display text-[1.5rem] leading-tight text-ink">{meal.title}</h3>
        {meal.displayDescription ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
            {meal.displayDescription}
          </p>
        ) : null}
        <p className="mt-3 border-t border-line pt-2.5 text-sm text-ink-soft">
          <span className="text-muted">Cooking</span>{" "}
          <span className="font-bold text-ink">
            {meal.responsible.length > 0 ? meal.responsible.join(" & ") : "Everyone"}
          </span>
        </p>
      </div>
    </Link>
  );
}

/**
 * A memory dropped between meals. Deliberately shaped unlike a meal card: the
 * picture is from earlier in the week and has nothing to do with the meal
 * above it. Tapping it lands on the gallery, so a clip is marked as a clip
 * rather than pretending to play here.
 */
function MemoryBreak({ memory }: { memory: MemoryCard }) {
  const portrait = memory.width && memory.height ? memory.height > memory.width : false;
  const duration = formatDuration(memory.durationSeconds);

  return (
    <Link href="/memories" className="group block overflow-hidden rounded-2xl">
      <div
        className={`relative w-full overflow-hidden rounded-2xl bg-subtle ${portrait ? "aspect-[4/5]" : "aspect-[4/3]"}`}
      >
        {memory.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={memory.thumbnailUrl}
            alt={`Added by ${memory.uploadedBy}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : null}
        {memory.kind === "video" ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-ink/70 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            <PlayGlyph className="h-3 w-3" />
            {duration ?? "Video"}
          </span>
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-2 text-xs">
        <span className="label text-muted">From the week</span>
        <span className="text-muted">
          {memory.uploadedBy}
          {" · "}
          <RelativeTime
            iso={memory.createdAt.toISOString()}
            initial={relativeTime(memory.createdAt)}
          />
        </span>
      </p>
    </Link>
  );
}
