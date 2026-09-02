import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmedBadge } from "@/components/meals/ConfirmedBadge";
import { MealConfirmPrompt } from "@/components/meals/MealConfirmPrompt";
import { Card, EmptyState, SectionLabel } from "@/components/ui/Card";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { FeedLightboxProvider, type FeedLightboxItem } from "@/components/memories/FeedLightbox";
import { FeedPhotoCarousel } from "@/components/memories/FeedPhotoCarousel";
import { FeedPostsSection } from "@/components/feed/FeedPostsSection";
import { requireMember } from "@/lib/auth/membership";
import { getDogStatuses } from "@/lib/dogs";
import { getActiveFeedPosts, withPostThumbnailUrls } from "@/lib/feedPosts";
import {
  interleaveFeed,
  memoryDrawCount,
  memoryDrawSeed,
  pickSeeded,
  withStayEvents,
} from "@/lib/feed";
import {
  getMealsAwaitingConfirmation,
  getUpcomingMeals,
  type MealRow,
} from "@/lib/meals";
import { formatDuration, getReadyMemories, withViewUrls } from "@/lib/memories";
import { getOpenShoppingItems, getRecentPickupActivity, type PickupActivity } from "@/lib/shopping";
import { formatStayTime, stayEventsFor, type StayEvent } from "@/lib/stay";
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
  const [meals, confirmations, dogs, shopping, pickups, memoryPool, feedPostRows] = await Promise.all([
    getUpcomingMeals(5),
    getMealsAwaitingConfirmation(member.id),
    getDogStatuses(),
    getOpenShoppingItems(),
    getRecentPickupActivity(),
    storageReady ? getReadyMemories(MEMORY_POOL) : Promise.resolve([]),
    getActiveFeedPosts(member.id),
  ]);
  const feedPosts = await withPostThumbnailUrls(feedPostRows);

  // Only the drawn memories get presigned URLs — no point signing the pool.
  const seed = memoryDrawSeed();
  const drawn = pickSeeded(memoryPool, memoryDrawCount(memoryPool.length, seed), seed);
  const memories = drawn.length > 0 ? await withViewUrls(drawn) : [];
  const today = cottageToday();
  const feed = withStayEvents(
    interleaveFeed(meals, memories),
    stayEventsFor(today),
  );
  // The set a tap on any carousel photo can swipe through — same order they
  // appear in, since `interleaveFeed` never reorders `memories` itself.
  const feedLightboxItems: FeedLightboxItem[] = memories.map((memory) => ({
    id: memory.id,
    kind: memory.kind,
    uploadedBy: memory.uploadedBy,
    thumbnailUrl: memory.thumbnailUrl,
    displayUrl: memory.displayUrl,
  }));

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-line pb-5">
        <p className="label text-muted">{formatLongDate(today)}</p>
        <h1 className="mt-2 font-display text-[2.25rem] leading-[1.05] text-ink">
          Hey {member.displayName}
        </h1>
      </header>

      {/* The one thing anyone can put here themselves, so it goes first —
          above even the meal confirmations, which are the house's own
          business rather than something a person chose to say. */}
      <FeedPostsSection
        posts={feedPosts.map((post) => ({
          id: post.id,
          body: post.body,
          author: post.author,
          authorMemberId: post.authorMemberId,
          createdAt: post.createdAt.toISOString(),
          media: post.media
            ? {
                kind: post.media.kind,
                thumbnailUrl: post.thumbnailUrl,
                ready: post.media.processingStatus === "ready",
              }
            : null,
        }))}
        currentMemberId={member.id}
        isAdmin={member.isAdmin}
        storageReady={storageReady}
      />

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

      {/* Recent town runs — keeps everyone posted on what just got picked up
          without a generic activity-feed system (spec §43): it's read
          straight off shopping_items, grouped by the shared timestamp a
          "Got it" batch confirm stamps across its items. */}
      {pickups.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel href="/shopping">From town</SectionLabel>
          {pickups.map((pickup) => (
            <PickupActivityTile key={`${pickup.pickedUpBy}-${pickup.pickedUpAt.toISOString()}`} pickup={pickup} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionLabel href="/meals">Coming up</SectionLabel>

        {feed.length === 0 ? (
          <Card>
            <EmptyState>
              No meals left on the schedule. Leftovers it is.
            </EmptyState>
          </Card>
        ) : (
          <FeedLightboxProvider items={feedLightboxItems}>
            {feed.map((item) =>
              item.kind === "meal" ? (
                <UpcomingMealCard
                  key={`meal-${item.meal.id}`}
                  meal={item.meal}
                  today={today}
                />
              ) : item.kind === "memoryCarousel" ? (
                <FeedPhotoCarousel
                  key="memory-carousel"
                  memories={item.memories.map((memory) => ({
                    id: memory.id,
                    kind: memory.kind,
                    uploadedBy: memory.uploadedBy,
                    thumbnailUrl: memory.thumbnailUrl,
                    durationLabel: formatDuration(memory.durationSeconds),
                  }))}
                />
              ) : (
                <StayTile key={`stay-${item.stay.kind}`} stay={item.stay} />
              ),
            )}
          </FeedLightboxProvider>
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
                  <span className="text-sm font-bold text-ink">
                    {DOG_LABEL[type]}
                  </span>
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
                    <span className="text-sm text-muted">
                      Nothing recorded yet
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <SectionLabel href="/shopping">
          {shopping.length > 0
            ? `Need from town · ${shopping.length}`
            : "Shopping"}
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
                <span className="min-w-0 truncate text-sm font-bold text-ink">
                  {item.name}
                </span>
                <span className="shrink-0 text-sm text-muted">
                  {item.requestedBy}
                </span>
              </li>
            ))}
            {shopping.length > 5 ? (
              <li className="pt-2.5 text-sm text-muted">
                + {shopping.length - 5} more
              </li>
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
  const others = meal.responsible.filter(
    (_, i) => meal.responsibleMemberIds[i] !== memberId,
  );
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
          <span className={`label ${isToday ? "text-ink" : "text-muted"}`}>
            {day}
          </span>
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
        <h3 className="mt-2 font-display text-[1.5rem] leading-tight text-ink">
          {meal.title}
        </h3>
        {meal.displayDescription ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
            {meal.displayDescription}
          </p>
        ) : null}
        <p className="mt-3 border-t border-line pt-2.5 text-sm text-ink-soft">
          <span className="text-muted">Cooking</span>{" "}
          <span className="font-bold text-ink">
            {meal.responsible.length > 0
              ? meal.responsible.join(" & ")
              : "Everyone"}
          </span>
        </p>
      </div>
    </Link>
  );
}

/**
 * The one day this fires for arrival, and the one day it fires for departure
 * (spec §13.2 has the same two facts as static Info text). Shaped like
 * {@link MealConfirmPrompt} — rule, label, heading, line — but lake-blue and
 * unanswerable: there's nothing to do here, only somewhere to be.
 */
function StayTile({ stay }: { stay: StayEvent }) {
  const isArrival = stay.kind === "arrival";
  return (
    <Link
      href="/info/getting-there"
      className="block overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_1px_rgba(14,18,22,0.03)] transition-colors active:bg-subtle"
    >
      <div className="border-l-[3px] border-lake p-4">
        <p className="label text-lake">
          {isArrival ? "Arrival today" : "Departure today"}
        </p>
        <h3 className="mt-2 font-display text-[1.5rem] leading-tight text-ink">
          {isArrival ? "Welcome to the cottage" : "Safe travels home"}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {isArrival ? "Check-in is" : "Check-out is"}{" "}
          <span className="font-bold text-ink-soft">
            {formatStayTime(stay)}
          </span>
          .
        </p>
      </div>
    </Link>
  );
}

/**
 * A single town run pulled straight off `shopping_items` — one tile per
 * distinct (picker, timestamp) group from {@link getRecentPickupActivity}.
 * Shaped like {@link StayTile} but pine, since that's already the "picked up"
 * color on the Shopping screen.
 */
function PickupActivityTile({ pickup }: { pickup: PickupActivity }) {
  return (
    <Link
      href="/shopping"
      className="block overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_1px_rgba(14,18,22,0.03)] transition-colors active:bg-subtle"
    >
      <div className="border-l-[3px] border-pine p-4">
        <p className="label text-pine">Picked up from town</p>
        <h3 className="mt-2 font-display text-[1.5rem] leading-tight text-ink">
          {pickup.items.join(", ")}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          <span className="font-bold text-ink-soft">{pickup.pickedUpBy}</span>{" "}
          <RelativeTime
            iso={pickup.pickedUpAt.toISOString()}
            initial={relativeTime(pickup.pickedUpAt)}
          />
        </p>
      </div>
    </Link>
  );
}

