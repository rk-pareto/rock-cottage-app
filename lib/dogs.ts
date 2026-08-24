import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { members, petEvents, pets, type PetEventType } from "@/db/schema";
import { enabledPetSlugs } from "@/lib/features";

export type DogEvent = {
  id: string;
  eventType: PetEventType;
  occurredAt: Date;
  recordedBy: string;
  recordedByMemberId: string;
};

export type DogStatus = {
  id: string;
  slug: string;
  name: string;
  latest: Partial<Record<PetEventType, DogEvent>>;
};

/** Enabled dogs with their most recent event of each type (spec §8.1, §10). */
export async function getDogStatuses(): Promise<DogStatus[]> {
  const slugs = enabledPetSlugs();
  const petRows = await db
    .select()
    .from(pets)
    .where(inArray(pets.slug, slugs))
    .orderBy(pets.sortOrder);

  if (petRows.length === 0) return [];

  // Small data set (3 types × 2 dogs); one indexed scan per dog is plenty.
  return Promise.all(
    petRows.map(async (pet) => {
      const rows = await db
        .select({
          id: petEvents.id,
          eventType: petEvents.eventType,
          occurredAt: petEvents.occurredAt,
          recordedByMemberId: petEvents.recordedByMemberId,
          recordedBy: members.displayName,
        })
        .from(petEvents)
        .innerJoin(members, eq(members.id, petEvents.recordedByMemberId))
        .where(eq(petEvents.petId, pet.id))
        .orderBy(desc(petEvents.occurredAt))
        .limit(60);

      const latest: Partial<Record<PetEventType, DogEvent>> = {};
      for (const row of rows) {
        if (!latest[row.eventType]) latest[row.eventType] = row;
      }
      return { id: pet.id, slug: pet.slug, name: pet.name, latest };
    }),
  );
}

/** Recent history for the per-dog Edit sheet (spec §10.3). */
export async function getRecentEvents(petId: string, limit = 20): Promise<DogEvent[]> {
  return db
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      recordedByMemberId: petEvents.recordedByMemberId,
      recordedBy: members.displayName,
    })
    .from(petEvents)
    .innerJoin(members, eq(members.id, petEvents.recordedByMemberId))
    .where(eq(petEvents.petId, petId))
    .orderBy(desc(petEvents.occurredAt))
    .limit(limit);
}

/** Resolve a pet by slug, honouring the feature flag server-side. */
export async function getEnabledPetBySlug(slug: string) {
  if (!enabledPetSlugs().includes(slug)) return null;
  const [pet] = await db.select().from(pets).where(eq(pets.slug, slug)).limit(1);
  return pet ?? null;
}

/** Resolve the pet an existing event belongs to, honouring the flag. */
export async function getEnabledPetForEvent(eventId: string) {
  const [row] = await db
    .select({ petId: pets.id, slug: pets.slug })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(eq(petEvents.id, eventId)))
    .limit(1);
  if (!row) return null;
  return enabledPetSlugs().includes(row.slug) ? row : null;
}
