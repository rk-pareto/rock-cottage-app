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
import { itemNameSchema, occurredAtSchema, uploadIntentSchema } from "@/lib/validation/schemas";
import { groupByDate, type MealRow } from "@/lib/meals";
import {
  interleaveFeed,
  photoDrawCount,
  photoDrawSeed,
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

  it("only accepts image uploads of a sane size", () => {
    const base = { filename: "IMG_1234.HEIC", bytes: 4_000_000 };
    expect(uploadIntentSchema.safeParse({ ...base, contentType: "image/heic" }).success).toBe(true);
    expect(uploadIntentSchema.safeParse({ ...base, contentType: "IMAGE/JPEG" }).success).toBe(true);
    expect(uploadIntentSchema.safeParse({ ...base, contentType: "video/mp4" }).success).toBe(false);
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
    ].map((r, i) => ({ ...r, id: String(i), displayDescription: null, practicalNotes: null, responsible: [] })) as MealRow[];

    const groups = groupByDate(rows);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-31", "2026-09-01"]);
    expect(groups[1]!.meals.map((m) => m.title)).toEqual(["Pancakes", "Pizza"]);
  });
});

describe("home feed", () => {
  const meals = ["m1", "m2", "m3", "m4", "m5"];
  const photos = ["p1", "p2", "p3"];

  it("drops a photo in after every second meal", () => {
    const feed = interleaveFeed(meals, photos.slice(0, 2));
    expect(feed.map((i) => (i.kind === "meal" ? i.meal : `(${i.photo})`))).toEqual([
      "m1",
      "m2",
      "(p1)",
      "m3",
      "m4",
      "(p2)",
      "m5",
    ]);
  });

  it("still shows photos when the meal schedule has run out", () => {
    const feed = interleaveFeed([], photos);
    expect(feed.every((i) => i.kind === "photo")).toBe(true);
    expect(feed).toHaveLength(3);
  });

  it("never drops a drawn photo", () => {
    const feed = interleaveFeed(["m1"], photos);
    expect(feed.filter((i) => i.kind === "photo")).toHaveLength(3);
  });

  it("draws between one and three photos", () => {
    expect(photoDrawCount(0)).toBe(1);
    expect(photoDrawCount(5)).toBe(2);
    expect(photoDrawCount(20)).toBe(3);
  });

  it("draws the same photos for the same seed and different ones otherwise", () => {
    const pool = Array.from({ length: 20 }, (_, i) => `p${i}`);
    expect(pickSeeded(pool, 3, "a")).toEqual(pickSeeded(pool, 3, "a"));
    expect(pickSeeded(pool, 3, "a")).not.toEqual(pickSeeded(pool, 3, "b"));
  });

  it("draws distinct photos and never more than the pool holds", () => {
    const pool = ["a", "b", "c"];
    const drawn = pickSeeded(pool, 10, "seed");
    expect(new Set(drawn).size).toBe(3);
    expect(pickSeeded([], 2, "seed")).toEqual([]);
  });

  it("holds the draw steady for an hour so a 30s refresh doesn't reshuffle", () => {
    const start = new Date("2026-08-24T14:00:00Z");
    const later = new Date("2026-08-24T14:30:00Z");
    const nextHour = new Date("2026-08-24T15:00:00Z");
    expect(photoDrawSeed(later)).toBe(photoDrawSeed(start));
    expect(photoDrawSeed(nextHour)).not.toBe(photoDrawSeed(start));
  });
});
