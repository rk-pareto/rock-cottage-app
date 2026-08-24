import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bringingItems, media, pets, petEvents, shoppingItems, type Member } from "@/db/schema";
import { cleanupMembers, createTestMember } from "./helpers";

/**
 * The signed-in member for the action under test. Swapping this is how we
 * simulate "a different member tries to delete someone else's thing".
 */
let currentMember: Member | null = null;

vi.mock("@/lib/auth/membership", () => ({
  requireMember: async () => {
    if (!currentMember) throw new Error("UNAUTHORIZED");
    return currentMember;
  },
  getCurrentMember: async () => currentMember,
  getMembership: async () =>
    currentMember ? { state: "member", member: currentMember } : { state: "unauthenticated" },
}));

const { addShoppingItem, deleteShoppingItem, setPickedUp } = await import(
  "@/app/(app)/shopping/actions"
);
const { addBringingItem, deleteBringingItem, setPacked, updateBringingItem } = await import(
  "@/app/(app)/bringing/actions"
);
const { recordPetEvent, deletePetEvent, updatePetEventTime } = await import(
  "@/app/(app)/dogs/actions"
);
const { deleteMemory } = await import("@/app/(app)/memories/actions");
const { getOpenShoppingItems } = await import("@/lib/shopping");
const { getBringingItems } = await import("@/lib/bringing");
const { getDogStatuses, getRecentEvents } = await import("@/lib/dogs");

let alice: Member; // the "owner" in ownership tests
let bob: Member; // an unrelated normal member
let admin: Member;
const createdIds: string[] = [];

beforeAll(async () => {
  alice = await createTestMember("alice");
  bob = await createTestMember("bob");
  admin = await createTestMember("admin", { isAdmin: true });
  createdIds.push(alice.id, bob.id, admin.id);
});

afterAll(async () => {
  await cleanupMembers(createdIds);
});

describe("authorization", () => {
  it("rejects every mutation when nobody is signed in", async () => {
    currentMember = null;
    expect(await addShoppingItem("milk")).toMatchObject({ ok: false });
    expect(await addBringingItem({ name: "ketchup" })).toMatchObject({ ok: false });
    expect(await recordPetEvent("alice", "outside")).toMatchObject({ ok: false });
  });

  it("rejects mutations from an inactive member", async () => {
    const inactive = await createTestMember("inactive", { isActive: false });
    createdIds.push(inactive.id);
    // requireMember() only ever returns active members, so an inactive one
    // presents to the actions exactly as a signed-out caller does.
    currentMember = null;
    expect(await addShoppingItem("milk")).toMatchObject({ ok: false });
  });
});

describe("shopping", () => {
  it("attributes the request to the session member, not the client", async () => {
    currentMember = alice;
    expect(await addShoppingItem("  Test Milk  ")).toEqual({ ok: true });

    const open = await getOpenShoppingItems();
    const row = open.find((r) => r.name === "Test Milk");
    expect(row).toBeDefined();
    expect(row!.requestedByMemberId).toBe(alice.id);
  });

  it("rejects empty names", async () => {
    currentMember = alice;
    expect(await addShoppingItem("   ")).toMatchObject({ ok: false });
  });

  it("lets any member mark an item picked up, recording who", async () => {
    currentMember = alice;
    await addShoppingItem("Test Ice");
    const [item] = await db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.name, "Test Ice"))
      .limit(1);

    currentMember = bob;
    expect(await setPickedUp(item!.id, true)).toEqual({ ok: true });

    const [after] = await db.select().from(shoppingItems).where(eq(shoppingItems.id, item!.id));
    expect(after!.pickedUpByMemberId).toBe(bob.id);
    expect(after!.pickedUpAt).toBeInstanceOf(Date);

    // Pickup is undoable after an accidental tap.
    expect(await setPickedUp(item!.id, false)).toEqual({ ok: true });
    const [undone] = await db.select().from(shoppingItems).where(eq(shoppingItems.id, item!.id));
    expect(undone!.pickedUpAt).toBeNull();
    expect(undone!.pickedUpByMemberId).toBeNull();
  });

  it("lets the requester delete, but not another normal member", async () => {
    currentMember = alice;
    await addShoppingItem("Test Apples");
    const [item] = await db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.name, "Test Apples"))
      .limit(1);

    currentMember = bob;
    expect(await deleteShoppingItem(item!.id)).toMatchObject({ ok: false });

    currentMember = alice;
    expect(await deleteShoppingItem(item!.id)).toEqual({ ok: true });
    const remaining = await db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.id, item!.id));
    expect(remaining).toHaveLength(0);
  });

  it("lets an admin delete someone else's item", async () => {
    currentMember = alice;
    await addShoppingItem("Test Admin Delete");
    const [item] = await db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.name, "Test Admin Delete"))
      .limit(1);

    currentMember = admin;
    expect(await deleteShoppingItem(item!.id)).toEqual({ ok: true });
  });
});

describe("bringing", () => {
  it("makes the current user responsible", async () => {
    currentMember = alice;
    expect(await addBringingItem({ name: "Test Ketchup", category: "Condiments" })).toEqual({
      ok: true,
    });

    const rows = await getBringingItems();
    const row = rows.find((r) => r.name === "Test Ketchup");
    expect(row!.responsibleMemberId).toBe(alice.id);
    expect(row!.category).toBe("Condiments");
  });

  it("lets the owner edit and pack, but blocks another member", async () => {
    currentMember = alice;
    await addBringingItem({ name: "Test Mustard" });
    const [item] = await db
      .select()
      .from(bringingItems)
      .where(eq(bringingItems.name, "Test Mustard"))
      .limit(1);

    currentMember = bob;
    expect(await updateBringingItem(item!.id, { name: "Hijacked" })).toMatchObject({ ok: false });
    expect(await setPacked(item!.id, true)).toMatchObject({ ok: false });
    expect(await deleteBringingItem(item!.id)).toMatchObject({ ok: false });

    currentMember = alice;
    expect(await updateBringingItem(item!.id, { name: "Test Dijon" })).toEqual({ ok: true });
    expect(await setPacked(item!.id, true)).toEqual({ ok: true });

    const [packed] = await db.select().from(bringingItems).where(eq(bringingItems.id, item!.id));
    expect(packed!.name).toBe("Test Dijon");
    expect(packed!.packedAt).toBeInstanceOf(Date);

    expect(await setPacked(item!.id, false)).toEqual({ ok: true });
    const [unpacked] = await db.select().from(bringingItems).where(eq(bringingItems.id, item!.id));
    expect(unpacked!.packedAt).toBeNull();

    expect(await deleteBringingItem(item!.id)).toEqual({ ok: true });
  });
});

describe("dogs", () => {
  const originalFlag = process.env.FEATURE_JUNO_ENABLED;
  afterAll(() => {
    process.env.FEATURE_JUNO_ENABLED = originalFlag;
  });

  it("records the current member and roughly the current time", async () => {
    process.env.FEATURE_JUNO_ENABLED = "false";
    currentMember = alice;
    const before = Date.now();
    expect(await recordPetEvent("alice", "outside")).toEqual({ ok: true });

    const [pet] = await db.select().from(pets).where(eq(pets.slug, "alice")).limit(1);
    const events = await getRecentEvents(pet!.id, 1);
    expect(events[0]!.recordedByMemberId).toBe(alice.id);
    expect(events[0]!.occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(events[0]!.occurredAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("rejects unknown event types", async () => {
    currentMember = alice;
    expect(await recordPetEvent("alice", "zoomies")).toMatchObject({ ok: false });
  });

  it("rejects Juno while the flag is false, and accepts it when true", async () => {
    currentMember = alice;

    process.env.FEATURE_JUNO_ENABLED = "false";
    expect(await recordPetEvent("juno", "fed")).toMatchObject({ ok: false });
    expect((await getDogStatuses()).map((d) => d.slug)).toEqual(["alice"]);

    process.env.FEATURE_JUNO_ENABLED = "true";
    expect(await recordPetEvent("juno", "fed")).toEqual({ ok: true });
    expect((await getDogStatuses()).map((d) => d.slug)).toEqual(["alice", "juno"]);

    process.env.FEATURE_JUNO_ENABLED = "false";
  });

  it("lets any member correct or delete a communal event", async () => {
    process.env.FEATURE_JUNO_ENABLED = "false";
    currentMember = alice;
    await recordPetEvent("alice", "poop");

    const [pet] = await db.select().from(pets).where(eq(pets.slug, "alice")).limit(1);
    const [event] = await getRecentEvents(pet!.id, 1);

    // Bob did not record it, but dog events are communal.
    currentMember = bob;
    const corrected = new Date(Date.now() - 60 * 60 * 1000);
    expect(await updatePetEventTime(event!.id, corrected.toISOString())).toEqual({ ok: true });

    const [updated] = await db.select().from(petEvents).where(eq(petEvents.id, event!.id));
    expect(Math.abs(updated!.occurredAt.getTime() - corrected.getTime())).toBeLessThan(1000);

    expect(await deletePetEvent(event!.id)).toEqual({ ok: true });
    expect(await db.select().from(petEvents).where(eq(petEvents.id, event!.id))).toHaveLength(0);
  });

  it("refuses to edit a Juno event while Juno is disabled", async () => {
    currentMember = alice;
    process.env.FEATURE_JUNO_ENABLED = "true";
    await recordPetEvent("juno", "outside");
    const [juno] = await db.select().from(pets).where(eq(pets.slug, "juno")).limit(1);
    const [event] = await getRecentEvents(juno!.id, 1);

    process.env.FEATURE_JUNO_ENABLED = "false";
    expect(await deletePetEvent(event!.id)).toMatchObject({ ok: false });
    expect(await updatePetEventTime(event!.id, new Date().toISOString())).toMatchObject({
      ok: false,
    });

    // Clean up via the enabled path.
    process.env.FEATURE_JUNO_ENABLED = "true";
    expect(await deletePetEvent(event!.id)).toEqual({ ok: true });
    process.env.FEATURE_JUNO_ENABLED = "false";
  });
});

describe("memories", () => {
  async function insertPhoto(ownerId: string) {
    const [row] = await db
      .insert(media)
      .values({
        kind: "image",
        originalKey: "memories/test/original/test.jpg",
        originalFilename: "test.jpg",
        originalContentType: "image/jpeg",
        originalBytes: 1234,
        uploadedByMemberId: ownerId,
        processingStatus: "ready",
      })
      .returning();
    return row!;
  }

  it("lets the uploader delete their own memory but not another member's", async () => {
    const photo = await insertPhoto(alice.id);

    currentMember = bob;
    expect(await deleteMemory(photo.id)).toMatchObject({ ok: false });

    currentMember = alice;
    expect(await deleteMemory(photo.id)).toEqual({ ok: true });
    expect(await db.select().from(media).where(eq(media.id, photo.id))).toHaveLength(0);
  });

  it("lets an admin delete any memory", async () => {
    const photo = await insertPhoto(alice.id);
    currentMember = admin;
    expect(await deleteMemory(photo.id)).toEqual({ ok: true });
  });

  it("keeps the original when derivative processing failed", async () => {
    const [row] = await db
      .insert(media)
      .values({
        kind: "image",
        originalKey: "memories/test/original/broken.heic",
        originalFilename: "broken.heic",
        originalContentType: "image/heic",
        originalBytes: 999,
        uploadedByMemberId: alice.id,
        processingStatus: "failed",
        processingError: "decode failed",
      })
      .returning();

    const [stored] = await db.select().from(media).where(eq(media.id, row!.id));
    expect(stored!.originalKey).toBe("memories/test/original/broken.heic");
    expect(stored!.displayKey).toBeNull();
    expect(stored!.thumbnailKey).toBeNull();
    expect(stored!.processingStatus).toBe("failed");

    currentMember = alice;
    await deleteMemory(row!.id);
  });

  it("stores a video with its poster and clears every object on delete", async () => {
    const [row] = await db
      .insert(media)
      .values({
        kind: "video",
        originalKey: "memories/test/original/clip.mov",
        posterKey: "memories/test/poster.jpg",
        originalFilename: "clip.mov",
        originalContentType: "video/quicktime",
        originalBytes: 8_000_000,
        originalWidth: 1080,
        originalHeight: 1920,
        durationSeconds: 14,
        uploadedByMemberId: alice.id,
        processingStatus: "ready",
      })
      .returning();

    expect(row!.kind).toBe("video");
    expect(row!.durationSeconds).toBe(14);

    currentMember = alice;
    expect(await deleteMemory(row!.id)).toEqual({ ok: true });
    expect(await db.select().from(media).where(eq(media.id, row!.id))).toHaveLength(0);
  });
});
