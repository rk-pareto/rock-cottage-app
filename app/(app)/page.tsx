import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Card";
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
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm font-semibold text-amber">{formatLongDate(today)}</p>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Hey {member.displayName} 👋
        </h1>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Coming up</h2>
          <Link href="/meals" className="shrink-0 text-sm font-semibold text-lake">
            See all
          </Link>
        </div>

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
        <Card key={dog.id}>
          <SectionHeading href="/dogs" action="Open">
            {dog.name}
          </SectionHeading>
          <ul className="flex flex-col gap-1.5">
            {(["outside", "poop", "fed"] as PetEventType[]).map((type) => {
              const event = dog.latest[type];
              return (
                <li key={type} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="w-16 shrink-0 font-bold text-ink">{DOG_LABEL[type]}</span>
                  {event ? (
                    <span className="text-muted">
                      <span className="font-semibold text-ink">
                        <RelativeTime
                          iso={event.occurredAt.toISOString()}
                          initial={relativeTime(event.occurredAt)}
                        />
                      </span>
                      {" · "}
                      {event.recordedBy}
                    </span>
                  ) : (
                    <span className="text-muted">Nothing recorded yet</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card>
        <SectionHeading href="/shopping">
          {shopping.length > 0 ? `Need from town — ${shopping.length}` : "Shopping"}
        </SectionHeading>
        {shopping.length === 0 ? (
          <EmptyState>Nothing needed from town.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-1">
            {shopping.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold text-ink">{item.name}</span>
                <span className="shrink-0 text-muted">{item.requestedBy}</span>
              </li>
            ))}
            {shopping.length > 5 ? (
              <li className="pt-1 text-sm text-muted">+ {shopping.length - 5} more</li>
            ) : null}
          </ul>
        )}
      </Card>

      {/* Photos are woven into the feed above; this covers the case where
          there were none to weave in. */}
      {photos.length === 0 ? (
        <Card>
          <SectionHeading href="/photos" action="View all">
            Photos
          </SectionHeading>
          <EmptyState>
            {storageReady
              ? "No photos yet. Someone go take a picture of the lake."
              : "Photo storage isn't set up yet."}
          </EmptyState>
        </Card>
      ) : null}
    </div>
  );
}

function UpcomingMealCard({ meal, today }: { meal: MealRow; today: string }) {
  const day = meal.mealDate === today ? "Today" : formatLongDate(meal.mealDate).split(",")[0];

  return (
    <Card>
      <Link href="/meals" className="block">
        <p className="text-xs font-bold uppercase tracking-widest text-amber">
          {day}
          {" · "}
          {MEAL_LABEL[meal.mealType] ?? meal.mealType}
        </p>
        <h3 className="mt-0.5 font-display text-lg font-semibold text-ink">{meal.title}</h3>
        {meal.displayDescription ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted italic">
            {meal.displayDescription}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted">
          {meal.responsible.length > 0 ? meal.responsible.join(" & ") : "Everyone"}
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
    <Link
      href="/photos"
      className="block overflow-hidden rounded-3xl border border-line bg-card shadow-[0_1px_2px_rgba(38,32,26,0.06)]"
    >
      <div className={`w-full bg-line ${portrait ? "aspect-[4/5]" : "aspect-[4/3]"}`}>
        {photo.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.thumbnailUrl}
            alt={`Uploaded by ${photo.uploadedBy}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 px-4 py-2.5 text-xs text-muted">
        <span className="font-bold uppercase tracking-widest text-pine">From the week</span>
        <span>
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
