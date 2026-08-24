import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, SectionLabel } from "@/components/ui/Card";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { requireMember } from "@/lib/auth/membership";
import { getDogStatuses } from "@/lib/dogs";
import { interleaveFeed, photoDrawCount, photoDrawSeed, pickSeeded } from "@/lib/feed";
import { getUpcomingMeals, type MealRow } from "@/lib/meals";
import { getReadyPhotos, withThumbnailUrls, type PhotoCard } from "@/lib/photos";
import { getOpenShoppingItems } from "@/lib/shopping";
import { isStorageConfigured } from "@/lib/storage/s3";
import { cottageToday, formatLongDate, relativeTime } from "@/lib/time";
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
const PHOTO_POOL = 60;

export default async function HomePage() {
  const member = await requireMember();
  const storageReady = isStorageConfigured();

  // Home queries the source tables directly — no activity-feed system (spec §43).
  const [meals, dogs, shopping, photoPool] = await Promise.all([
    getUpcomingMeals(5),
    getDogStatuses(),
    getOpenShoppingItems(),
    storageReady ? getReadyPhotos(PHOTO_POOL) : Promise.resolve([]),
  ]);

  // Only the drawn photos get presigned URLs — no point signing the whole pool.
  const drawn = pickSeeded(photoPool, photoDrawCount(meals.length), photoDrawSeed());
  const photos = drawn.length > 0 ? await withThumbnailUrls(drawn) : [];
  const feed = interleaveFeed(meals, photos);
  const today = cottageToday();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-line pb-5">
        <p className="label text-muted">{formatLongDate(today)}</p>
        <h1 className="mt-2 font-display text-[2.25rem] leading-[1.05] text-ink">
          Hey {member.displayName}
        </h1>
      </header>

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
              <PhotoBreak key={`photo-${item.photo.id}`} photo={item.photo} />
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

      {/* Photos are woven into the feed above; this covers the case where
          there were none to weave in. */}
      {photos.length === 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel href="/photos" action="View all">
            Photos
          </SectionLabel>
          <EmptyState>
            {storageReady
              ? "No photos yet. Someone go take a picture of the lake."
              : "Photo storage isn't set up yet."}
          </EmptyState>
        </section>
      ) : null}
    </div>
  );
}

function UpcomingMealCard({ meal, today }: { meal: MealRow; today: string }) {
  const isToday = meal.mealDate === today;
  const day = isToday ? "Today" : formatLongDate(meal.mealDate).split(",")[0];

  return (
    <Card className="transition-colors active:bg-subtle">
      <Link href="/meals" className="block">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`label ${isToday ? "text-ink" : "text-muted"}`}>{day}</span>
          <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
          <span className="label text-muted">
            {MEAL_LABEL[meal.mealType] ?? meal.mealType}
          </span>
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
      </Link>
    </Card>
  );
}

/**
 * A photo dropped between meals. Deliberately shaped unlike a meal card: the
 * picture is from earlier in the week and has nothing to do with the meal
 * above it.
 */
function PhotoBreak({ photo }: { photo: PhotoCard }) {
  const portrait = photo.width && photo.height ? photo.height > photo.width : false;

  return (
    <Link href="/photos" className="group block overflow-hidden rounded-2xl">
      <div className={`w-full overflow-hidden rounded-2xl bg-subtle ${portrait ? "aspect-[4/5]" : "aspect-[4/3]"}`}>
        {photo.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.thumbnailUrl}
            alt={`Uploaded by ${photo.uploadedBy}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-2 text-xs">
        <span className="label text-muted">From the week</span>
        <span className="text-muted">
          {photo.uploadedBy}
          {" · "}
          <RelativeTime
            iso={photo.createdAt.toISOString()}
            initial={relativeTime(photo.createdAt)}
          />
        </span>
      </p>
    </Link>
  );
}
