import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, SectionHeading } from "@/components/ui/Card";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { requireMember } from "@/lib/auth/membership";
import { getDogStatuses } from "@/lib/dogs";
import { getUpcomingMeals } from "@/lib/meals";
import { getReadyPhotos, withThumbnailUrls } from "@/lib/photos";
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

export default async function HomePage() {
  const member = await requireMember();
  const storageReady = isStorageConfigured();

  // Home queries the source tables directly — no activity-feed system (spec §43).
  const [meals, dogs, shopping, photoRows] = await Promise.all([
    getUpcomingMeals(5),
    getDogStatuses(),
    getOpenShoppingItems(),
    storageReady ? getReadyPhotos(6) : Promise.resolve([]),
  ]);
  const photos = storageReady ? await withThumbnailUrls(photoRows) : [];
  const today = cottageToday();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm font-semibold text-amber">{formatLongDate(today)}</p>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Hey {member.displayName} 👋
        </h1>
      </header>

      <Card>
        <SectionHeading href="/meals">Coming up</SectionHeading>
        {meals.length === 0 ? (
          <EmptyState>No meals left on the schedule. Leftovers it is.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {meals.map((meal) => (
              <li key={meal.id}>
                <Link href="/meals" className="block">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">
                    {meal.mealDate === today ? "Today" : formatLongDate(meal.mealDate).split(",")[0]}
                    {" · "}
                    {MEAL_LABEL[meal.mealType] ?? meal.mealType}
                  </p>
                  <p className="font-bold text-ink">{meal.title}</p>
                  <p className="text-sm text-muted">
                    {meal.responsible.length > 0 ? meal.responsible.join(" & ") : "Everyone"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

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

      <Card>
        <SectionHeading href="/photos" action="View all">
          Recent photos
        </SectionHeading>
        {photos.length === 0 ? (
          <EmptyState>
            {storageReady
              ? "No photos yet. Someone go take a picture of the lake."
              : "Photo storage isn't set up yet."}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5">
            {photos.map((photo) => (
              <li key={photo.id} className="aspect-square">
                <Link
                  href="/photos"
                  className="block h-full w-full overflow-hidden rounded-xl bg-line"
                >
                  {photo.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={photo.thumbnailUrl}
                      alt={`Uploaded by ${photo.uploadedBy}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
