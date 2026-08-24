import type { Metadata } from "next";
import { DogSection, type LatestEvent } from "@/components/dogs/DogSection";
import { PageHeader } from "@/components/ui/Card";
import type { SheetEvent } from "@/components/dogs/EventSheet";
import { requireMember } from "@/lib/auth/membership";
import { getDogStatuses, getRecentEvents } from "@/lib/dogs";
import { features } from "@/lib/features";
import type { PetEventType } from "@/db/schema";

export const metadata: Metadata = { title: "Dogs · Rock Cottage" };

const EVENT_TYPES: PetEventType[] = ["outside", "poop", "fed"];

export default async function DogsPage() {
  const member = await requireMember();
  const dogs = await getDogStatuses();

  const sections = await Promise.all(
    dogs.map(async (dog) => {
      const recent = await getRecentEvents(dog.id, 20);
      const latest = Object.fromEntries(
        EVENT_TYPES.map((type) => {
          const event = dog.latest[type];
          return [
            type,
            event
              ? ({
                  occurredAt: event.occurredAt.toISOString(),
                  recordedBy: event.recordedBy,
                } satisfies LatestEvent)
              : null,
          ];
        }),
      ) as Record<PetEventType, LatestEvent>;

      const sheetEvents: SheetEvent[] = recent.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        occurredAt: e.occurredAt.toISOString(),
        recordedBy: e.recordedBy,
      }));

      return { dog, latest, sheetEvents };
    }),
  );

  return (
    <>
      <PageHeader
        title={features.junoEnabled ? "Dogs" : "Alice"}
        subtitle="One tap. It records right now, under your name."
      />

      {sections.length === 0 ? (
        <p className="text-sm text-muted">No dogs are set up yet. Run the seed.</p>
      ) : (
        sections.map(({ dog, latest, sheetEvents }) => (
          <DogSection
            key={dog.id}
            slug={dog.slug}
            name={dog.name}
            latest={latest}
            recent={sheetEvents}
            currentMemberName={member.displayName}
          />
        ))
      )}
    </>
  );
}
