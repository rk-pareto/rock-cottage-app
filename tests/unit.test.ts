import { afterEach, describe, expect, it } from "vitest";
import {
  dogsNavLabel,
  enabledPetSlugs,
  features,
  isPetEnabled,
} from "@/lib/features";
import {
  addDays,
  cottageToday,
  formatClock,
  formatWeekday,
  fromCottageInputValue,
  mealStartAt,
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
import { awaitsConfirmation, groupByDate, type MealRow } from "@/lib/meals";
import {
  interleaveFeed,
  memoryDrawCount,
  memoryDrawSeed,
  pickSeeded,
  withStayEvents,
} from "@/lib/feed";
import {
  ARRIVAL_DATE,
  DEPARTURE_DATE,
  formatStayTime,
  stayEventsFor,
} from "@/lib/stay";

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
    expect(relativeTime(new Date("2026-09-02T19:59:30Z"), now)).toBe(
      "just now",
    );
    expect(relativeTime(new Date("2026-09-02T19:13:00Z"), now)).toBe(
      "47 minutes ago",
    );
    expect(relativeTime(new Date("2026-09-02T17:00:00Z"), now)).toBe(
      "3 hours ago",
    );
    expect(relativeTime(new Date("2026-09-01T20:00:00Z"), now)).toBe(
      "1 day ago",
    );
  });

  it("round-trips a datetime-local value through cottage time", () => {
    const instant = new Date("2026-09-03T00:42:00Z");
    const inputValue = toCottageInputValue(instant);
    expect(inputValue).toBe("2026-09-02T20:42");
    expect(fromCottageInputValue(inputValue).toISOString()).toBe(
      instant.toISOString(),
    );
  });
});

describe("validation", () => {
  it("trims names and rejects empty ones", () => {
    expect(itemNameSchema.parse("  milk  ")).toBe("milk");
    expect(itemNameSchema.safeParse("   ").success).toBe(false);
    expect(itemNameSchema.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("rejects event times absurdly far from now", () => {
    expect(occurredAtSchema.safeParse(new Date().toISOString()).success).toBe(
      true,
    );
    expect(occurredAtSchema.safeParse("1998-01-01T00:00:00Z").success).toBe(
      false,
    );
    expect(occurredAtSchema.safeParse("not a time").success).toBe(false);
  });

  it("only accepts photo and video uploads of a sane size", () => {
    const base = { filename: "IMG_1234.HEIC", bytes: 4_000_000 };
    expect(
      uploadIntentSchema.safeParse({ ...base, contentType: "image/heic" })
        .success,
    ).toBe(true);
    expect(
      uploadIntentSchema.safeParse({ ...base, contentType: "IMAGE/JPEG" })
        .success,
    ).toBe(true);
    expect(
      uploadIntentSchema.safeParse({ ...base, contentType: "video/mp4" })
        .success,
    ).toBe(true);
    expect(
      uploadIntentSchema.safeParse({ ...base, contentType: "audio/mpeg" })
        .success,
    ).toBe(false);
    expect(
      uploadIntentSchema.safeParse({
        ...base,
        contentType: "image/jpeg",
        bytes: 999_000_000,
      }).success,
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
      confirmedAt: null,
      responsible: [],
      responsibleMemberIds: [],
    })) as MealRow[];

    const groups = groupByDate(rows);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-31", "2026-09-01"]);
    expect(groups[1]!.meals.map((m) => m.title)).toEqual(["Pancakes", "Pizza"]);
  });
});

describe("meal confirmation", () => {
  // Sep 1 2026 is EDT (UTC-4), so cottage 5:00 PM is 21:00Z.
  const DINNER = "2026-09-01T21:00:00.000Z";
  const owner = "member-1";

  const meal = {
    mealDate: "2026-09-01",
    mealType: "dinner",
    confirmedAt: null as Date | null,
    responsibleMemberIds: [owner],
  };

  it("puts each meal at its cottage serving time", () => {
    expect(mealStartAt("2026-09-01", "breakfast").toISOString()).toBe(
      "2026-09-01T12:00:00.000Z",
    );
    expect(mealStartAt("2026-09-01", "lunch").toISOString()).toBe(
      "2026-09-01T16:00:00.000Z",
    );
    expect(mealStartAt("2026-09-01", "dinner").toISOString()).toBe(DINNER);
  });

  it("holds the serving time across the standard-time boundary", () => {
    // Nov 8 2026 is EST (UTC-5) — same 5:00 PM on the clock, different offset.
    expect(mealStartAt("2026-11-08", "dinner").toISOString()).toBe(
      "2026-11-08T22:00:00.000Z",
    );
  });

  it("has no opinion about a meal type it doesn't know", () => {
    expect(Number.isNaN(mealStartAt("2026-09-01", "brunch").getTime())).toBe(
      true,
    );
    expect(
      awaitsConfirmation(
        { ...meal, mealType: "brunch" },
        owner,
        new Date(DINNER),
      ),
    ).toBe(false);
  });

  it("opens the window exactly 22 hours before service", () => {
    const opens = new Date(Date.parse(DINNER) - 22 * 60 * 60 * 1000);
    expect(
      awaitsConfirmation(meal, owner, new Date(opens.getTime() - 1000)),
    ).toBe(false);
    expect(awaitsConfirmation(meal, owner, opens)).toBe(true);
  });

  it("closes the window when the food is served", () => {
    const served = new Date(DINNER);
    expect(
      awaitsConfirmation(meal, owner, new Date(served.getTime() - 1000)),
    ).toBe(true);
    expect(awaitsConfirmation(meal, owner, served)).toBe(false);
  });

  it("lands just after the previous day's dinner", () => {
    // 22 hours before Tuesday 5 PM is Monday 7 PM — the plates are cleared.
    const opens = new Date(Date.parse(DINNER) - 22 * 60 * 60 * 1000);
    expect(formatClock(opens)).toBe("7:00 p.m.");
    expect(opens.toISOString().slice(0, 10)).toBe("2026-08-31");
  });

  it("stops asking once the meal is answered for", () => {
    const inside = new Date("2026-09-01T12:00:00.000Z");
    expect(awaitsConfirmation(meal, owner, inside)).toBe(true);
    expect(
      awaitsConfirmation({ ...meal, confirmedAt: new Date() }, owner, inside),
    ).toBe(false);
  });

  it("only asks the people cooking, and asks nobody when it's everyone's", () => {
    const inside = new Date("2026-09-01T12:00:00.000Z");
    expect(awaitsConfirmation(meal, "member-2", inside)).toBe(false);
    expect(
      awaitsConfirmation({ ...meal, responsibleMemberIds: [] }, owner, inside),
    ).toBe(false);
    expect(
      awaitsConfirmation(
        { ...meal, responsibleMemberIds: [owner, "member-2"] },
        "member-2",
        inside,
      ),
    ).toBe(true);
  });
});

describe("home feed", () => {
  const meals = ["m1", "m2", "m3", "m4", "m5"];
  const memories = ["p1", "p2", "p3"];

  it("drops the memory carousel in after the second meal", () => {
    const feed = interleaveFeed(meals, memories);
    expect(
      feed.map((i) =>
        i.kind === "meal" ? i.meal : `(${i.memories.join(",")})`,
      ),
    ).toEqual(["m1", "m2", "(p1,p2,p3)", "m3", "m4", "m5"]);
  });

  it("still shows the carousel when the meal schedule has run out", () => {
    const feed = interleaveFeed([], memories);
    expect(feed).toEqual([{ kind: "memoryCarousel", memories }]);
  });

  it("pins the carousel to the front of a single-meal feed", () => {
    const feed = interleaveFeed(["m1"], memories);
    expect(
      feed.map((i) => (i.kind === "meal" ? i.meal : "(carousel)")),
    ).toEqual(["m1", "(carousel)"]);
  });

  it("skips the carousel entirely when there are no memories to draw", () => {
    const feed = interleaveFeed(meals, []);
    expect(feed.every((i) => i.kind === "meal")).toBe(true);
    expect(feed).toHaveLength(5);
  });

  it("draws between five and ten memories, never more than the pool holds", () => {
    for (let i = 0; i < 20; i++) {
      const seed = `seed-${i}`;
      expect(memoryDrawCount(60, seed)).toBeGreaterThanOrEqual(5);
      expect(memoryDrawCount(60, seed)).toBeLessThanOrEqual(10);
    }
    expect(memoryDrawCount(3, "seed")).toBe(3);
    expect(memoryDrawCount(0, "seed")).toBe(0);
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

describe("arrival/departure tiles", () => {
  const dayMeals = [
    { mealDate: ARRIVAL_DATE, id: "dinner" },
    { mealDate: "2026-09-01", id: "breakfast" },
  ];

  it("only fires on the arrival or departure date itself", () => {
    expect(stayEventsFor(ARRIVAL_DATE)).toEqual([
      { kind: "arrival", date: ARRIVAL_DATE, time: "16:00" },
    ]);
    expect(stayEventsFor(DEPARTURE_DATE)).toEqual([
      { kind: "departure", date: DEPARTURE_DATE, time: "10:00" },
    ]);
    expect(stayEventsFor("2026-09-01")).toEqual([]);
  });

  it("phrases arrival and departure times the way Info does", () => {
    expect(
      formatStayTime({ kind: "arrival", date: ARRIVAL_DATE, time: "16:00" }),
    ).toBe("After 4:00 p.m.");
    expect(
      formatStayTime({
        kind: "departure",
        date: DEPARTURE_DATE,
        time: "10:00",
      }),
    ).toBe("Before 10:00 a.m.");
  });

  it("places the tile ahead of the first meal on its date", () => {
    const feed = interleaveFeed(dayMeals, []);
    const withTile = withStayEvents(feed, stayEventsFor(ARRIVAL_DATE));
    expect(
      withTile.map((i) =>
        i.kind === "meal"
          ? i.meal.id
          : i.kind === "stay"
            ? `(${i.stay.kind})`
            : "?",
      ),
    ).toEqual(["(arrival)", "dinner", "breakfast"]);
  });

  it("pins the tile to the front when its date has no meal in the feed", () => {
    const feed = interleaveFeed(
      [{ mealDate: "2026-09-01", id: "breakfast" }],
      [],
    );
    const withTile = withStayEvents(feed, stayEventsFor(ARRIVAL_DATE));
    expect(withTile[0]).toEqual({
      kind: "stay",
      stay: { kind: "arrival", date: ARRIVAL_DATE, time: "16:00" },
    });
  });

  it("leaves the feed untouched on an ordinary day", () => {
    const feed = interleaveFeed(dayMeals, []);
    expect(withStayEvents(feed, stayEventsFor("2026-09-01"))).toBe(feed);
  });
});

describe("upload intent", () => {
  const photo = {
    filename: "IMG_0001.HEIC",
    contentType: "image/heic",
    bytes: 4_000_000,
  };
  const video = {
    filename: "IMG_0002.MOV",
    contentType: "video/quicktime",
    bytes: 90_000_000,
  };

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
      uploadIntentSchema.safeParse({ ...photo, contentType: "application/pdf" })
        .success,
    ).toBe(false);
  });

  it("holds videos to their own size limit, not the photo one", () => {
    // A clip larger than any photo may pass; a photo that size may not.
    expect(
      uploadIntentSchema.safeParse({ ...video, bytes: MAX_PHOTO_BYTES + 1 })
        .success,
    ).toBe(true);
    expect(
      uploadIntentSchema.safeParse({ ...photo, bytes: MAX_PHOTO_BYTES + 1 })
        .success,
    ).toBe(false);
    expect(
      uploadIntentSchema.safeParse({ ...video, bytes: MAX_VIDEO_BYTES + 1 })
        .success,
    ).toBe(false);
  });

  it("carries the clip details the browser measured", () => {
    const parsed = uploadIntentSchema.parse({
      ...video,
      width: 1080,
      height: 1920,
      durationSeconds: 13.6,
      hasPoster: true,
    });
    expect(parsed).toMatchObject({
      width: 1080,
      height: 1920,
      durationSeconds: 13.6,
      hasPoster: true,
    });
  });
});
