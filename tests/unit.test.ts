import { afterEach, describe, expect, it } from "vitest";
import { dogsNavLabel, enabledPetSlugs, features, isPetEnabled } from "@/lib/features";
import {
  addDays,
  cottageToday,
  formatClock,
  formatWeekday,
  fromCottageInputValue,
  relativeTime,
  toCottageInputValue,
} from "@/lib/time";
import {
  itemNameSchema,
  kindForContentType,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  occurredAtSchema,
  uploadIntentSchema,
} from "@/lib/validation/schemas";
import { groupByDate, type MealRow } from "@/lib/meals";
import {
  interleaveFeed,
  memoryDrawCount,
  memoryDrawSeed,
  pickSeeded,
} from "@/lib/feed";

const original = process.env.FEATURE_JUNO_ENABLED;
afterEach(() => {
  process.env.FEATURE_JUNO_ENABLED = original;
});

describe("feature flags", () => {
  it("defaults to false when unset", () => {
    delete process.env.FEATURE_JUNO_ENABLED;
    expect(features.junoEnabled).toBe(false);
  });

  it("only accepts explicit truthy values", () => {
    for (const value of ["false", "0", "no", "", "maybe", "TRUE-ish"]) {
      process.env.FEATURE_JUNO_ENABLED = value;
      expect(features.junoEnabled, `"${value}" should be falsy`).toBe(false);
    }
    for (const value of ["true", "TRUE", " 1 ", "yes", "on"]) {
      process.env.FEATURE_JUNO_ENABLED = value;
      expect(features.junoEnabled, `"${value}" should be truthy`).toBe(true);
    }
  });

  it("keeps Alice always enabled and gates Juno on the flag", () => {
    process.env.FEATURE_JUNO_ENABLED = "false";
    expect(enabledPetSlugs()).toEqual(["alice"]);
    expect(isPetEnabled("alice")).toBe(true);
    expect(isPetEnabled("juno")).toBe(false);
    expect(dogsNavLabel()).toBe("Alice");

    process.env.FEATURE_JUNO_ENABLED = "true";
    expect(enabledPetSlugs()).toEqual(["alice", "juno"]);
    expect(isPetEnabled("juno")).toBe(true);
    expect(dogsNavLabel()).toBe("Dogs");
  });
});

describe("cottage time", () => {
  it("renders wall-clock time in America/Toronto regardless of server zone", () => {
    // 2026-09-02 20:42 EDT === 2026-09-03 00:42 UTC
    expect(formatClock(new Date("2026-09-03T00:42:00Z"))).toBe("8:42 p.m.");
  });

  it("treats a SQL date as a calendar day, not a UTC instant", () => {
    expect(formatWeekday("2026-08-31")).toBe("Monday");
    expect(formatWeekday("2026-09-06")).toBe("Sunday");
  });

  it("computes the cottage calendar date across the UTC midnight boundary", () => {
    // 00:30 UTC on Sep 3 is still the evening of Sep 2 in Toronto.
    expect(cottageToday(new Date("2026-09-03T00:30:00Z"))).toBe("2026-09-02");
    expect(cottageToday(new Date("2026-09-03T12:00:00Z"))).toBe("2026-09-03");
  });

  it("adds days without drifting", () => {
    expect(addDays("2026-08-31", 6)).toBe("2026-09-06");
  });

  it("describes recent events in human terms", () => {
    const now = new Date("2026-09-02T20:00:00Z");
    expect(relativeTime(new Date("2026-09-02T19:59:30Z"), now)).toBe("just now");
    expect(relativeTime(new Date("2026-09-02T19:13:00Z"), now)).toBe("47 minutes ago");
    expect(relativeTime(new Date("2026-09-02T17:00:00Z"), now)).toBe("3 hours ago");
    expect(relativeTime(new Date("2026-09-01T20:00:00Z"), now)).toBe("1 day ago");
  });

  it("round-trips a datetime-local value through cottage time", () => {
    const instant = new Date("2026-09-03T00:42:00Z");
    const inputValue = toCottageInputValue(instant);
    expect(inputValue).toBe("2026-09-02T20:42");
    expect(fromCottageInputValue(inputValue).toISOString()).toBe(instant.toISOString());
  });
});

describe("validation", () => {
  it("trims names and rejects empty ones", () => {
    expect(itemNameSchema.parse("  milk  ")).toBe("milk");
    expect(itemNameSchema.safeParse("   ").success).toBe(false);
    expect(itemNameSchema.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("rejects event times absurdly far from now", () => {
    expect(occurredAtSchema.safeParse(new Date().toISOString()).success).toBe(true);
    expect(occurredAtSchema.safeParse("1998-01-01T00:00:00Z").success).toBe(false);
    expect(occurredAtSchema.safeParse("not a time").success).toBe(false);
  });

  it("only accepts photo and video uploads of a sane size", () => {
    const base = { filename: "IMG_1234.HEIC", bytes: 4_000_000 };
    expect(uploadIntentSchema.safeParse({ ...base, contentType: "image/heic" }).success).toBe(true);
    expect(uploadIntentSchema.safeParse({ ...base, contentType: "IMAGE/JPEG" }).success).toBe(true);
    expect(uploadIntentSchema.safeParse({ ...base, contentType: "video/mp4" }).success).toBe(true);
    expect(uploadIntentSchema.safeParse({ ...base, contentType: "audio/mpeg" }).success).toBe(false);
    expect(
      uploadIntentSchema.safeParse({ ...base, contentType: "image/jpeg", bytes: 999_000_000 })
        .success,
    ).toBe(false);
  });
});

describe("meal grouping", () => {
  it("keeps days in chronological order with meals grouped under each", () => {
    const rows = [
      { mealDate: "2026-08-31", mealType: "dinner", title: "Chili" },
      { mealDate: "2026-09-01", mealType: "breakfast", title: "Pancakes" },
      { mealDate: "2026-09-01", mealType: "dinner", title: "Pizza" },
    ].map((r, i) => ({
      ...r,
      id: String(i),
      displayDescription: null,
      practicalNotes: null,
      photoPath: null,
      responsible: [],
    })) as MealRow[];

    const groups = groupByDate(rows);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-31", "2026-09-01"]);
    expect(groups[1]!.meals.map((m) => m.title)).toEqual(["Pancakes", "Pizza"]);
  });
});

describe("home feed", () => {
  const meals = ["m1", "m2", "m3", "m4", "m5"];
  const memories = ["p1", "p2", "p3"];

  it("drops a memory in after every second meal", () => {
    const feed = interleaveFeed(meals, memories.slice(0, 2));
    expect(feed.map((i) => (i.kind === "meal" ? i.meal : `(${i.memory})`))).toEqual([
      "m1",
      "m2",
      "(p1)",
      "m3",
      "m4",
      "(p2)",
      "m5",
    ]);
  });

  it("still shows memories when the meal schedule has run out", () => {
    const feed = interleaveFeed([], memories);
    expect(feed.every((i) => i.kind === "memory")).toBe(true);
    expect(feed).toHaveLength(3);
  });

  it("never drops a drawn memory", () => {
    const feed = interleaveFeed(["m1"], memories);
    expect(feed.filter((i) => i.kind === "memory")).toHaveLength(3);
  });

  it("draws between one and three memories", () => {
    expect(memoryDrawCount(0)).toBe(1);
    expect(memoryDrawCount(5)).toBe(2);
    expect(memoryDrawCount(20)).toBe(3);
  });

  it("draws the same memories for the same seed and different ones otherwise", () => {
    const pool = Array.from({ length: 20 }, (_, i) => `p${i}`);
    expect(pickSeeded(pool, 3, "a")).toEqual(pickSeeded(pool, 3, "a"));
    expect(pickSeeded(pool, 3, "a")).not.toEqual(pickSeeded(pool, 3, "b"));
  });

  it("draws distinct memories and never more than the pool holds", () => {
    const pool = ["a", "b", "c"];
    const drawn = pickSeeded(pool, 10, "seed");
    expect(new Set(drawn).size).toBe(3);
    expect(pickSeeded([], 2, "seed")).toEqual([]);
  });

  it("holds the draw steady for an hour so a 30s refresh doesn't reshuffle", () => {
    const start = new Date("2026-08-24T14:00:00Z");
    const later = new Date("2026-08-24T14:30:00Z");
    const nextHour = new Date("2026-08-24T15:00:00Z");
    expect(memoryDrawSeed(later)).toBe(memoryDrawSeed(start));
    expect(memoryDrawSeed(nextHour)).not.toBe(memoryDrawSeed(start));
  });
});

describe("upload intent", () => {
  const photo = { filename: "IMG_0001.HEIC", contentType: "image/heic", bytes: 4_000_000 };
  const video = { filename: "IMG_0002.MOV", contentType: "video/quicktime", bytes: 90_000_000 };

  it("sorts a content type into the kind it belongs to", () => {
    expect(kindForContentType("image/heic")).toBe("image");
    expect(kindForContentType("VIDEO/MP4 ")).toBe("video");
    expect(kindForContentType("application/pdf")).toBeNull();
  });

  it("tags a still as an image and a clip as a video", () => {
    expect(uploadIntentSchema.parse(photo).kind).toBe("image");
    expect(uploadIntentSchema.parse(video).kind).toBe("video");
  });

  it("rejects anything that is neither", () => {
    expect(
      uploadIntentSchema.safeParse({ ...photo, contentType: "application/pdf" }).success,
    ).toBe(false);
  });

  it("holds videos to their own size limit, not the photo one", () => {
    // A clip larger than any photo may pass; a photo that size may not.
    expect(uploadIntentSchema.safeParse({ ...video, bytes: MAX_PHOTO_BYTES + 1 }).success).toBe(
      true,
    );
    expect(uploadIntentSchema.safeParse({ ...photo, bytes: MAX_PHOTO_BYTES + 1 }).success).toBe(
      false,
    );
    expect(uploadIntentSchema.safeParse({ ...video, bytes: MAX_VIDEO_BYTES + 1 }).success).toBe(
      false,
    );
  });

  it("carries the clip details the browser measured", () => {
    const parsed = uploadIntentSchema.parse({
      ...video,
      width: 1080,
      height: 1920,
      durationSeconds: 13.6,
      hasPoster: true,
    });
    expect(parsed).toMatchObject({ width: 1080, height: 1920, durationSeconds: 13.6, hasPoster: true });
  });
});
