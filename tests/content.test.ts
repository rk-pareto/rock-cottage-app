import { describe, expect, it } from "vitest";
import { readdir } from "node:fs/promises";
import { getInfoPage, getInfoPages } from "@/lib/info";
import { getAllMeals, getUpcomingMeals } from "@/lib/meals";
import { MEALS } from "@/db/seed/data";

describe("cottage info", () => {
  it("renders one page per Markdown file, ordered by frontmatter", async () => {
    const pages = await getInfoPages();
    const files = (await readdir("content/info")).filter((f) => f.endsWith(".md"));

    expect(pages.length).toBe(files.length);
    expect(pages.length).toBeGreaterThan(0);

    const orders = pages.map((p) => p.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    for (const page of pages) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("resolves a page by slug and refuses path traversal", async () => {
    const [first] = await getInfoPages();
    expect((await getInfoPage(first!.slug))?.title).toBe(first!.title);
    expect(await getInfoPage("../../package")).toBeNull();
    expect(await getInfoPage("nope")).toBeNull();
  });

  it("carries the cottage address so it can be represented", async () => {
    const pages = await getInfoPages();
    const all = pages.map((p) => p.body).join("\n");
    expect(all).toContain("1323 Carlingford Road");
    expect(all).toMatch(/check ?-?in/i);
  });
});

describe("meals", () => {
  it("returns the whole schedule in chronological order", async () => {
    const meals = await getAllMeals();
    expect(meals.length).toBeGreaterThan(0);

    const keys = meals.map((m) => `${m.mealDate} ${{ breakfast: 1, lunch: 2, dinner: 3 }[m.mealType]}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it("fills exactly one slot per day, which is what the seed key relies on", () => {
    const slots = MEALS.map((m) => `${m.mealDate} ${m.mealType}`);
    expect(new Set(slots).size, "two seeded meals share a date and type").toBe(slots.length);
  });

  it("gives every meal a restaurant-style description", async () => {
    const seededTitles = new Set(MEALS.map((m) => m.title));
    const meals = await getAllMeals();
    for (const meal of meals) {
      // A meal the cook renamed has had its prose cleared on purpose — the
      // paragraph described the dish they're no longer making.
      if (!seededTitles.has(meal.title)) continue;
      expect(meal.displayDescription, `${meal.title} has no description`).toBeTruthy();
      expect(meal.displayDescription!.length).toBeGreaterThan(40);
    }
  });

  it("keeps operational notes out of the display description", async () => {
    const meals = await getAllMeals();
    const eggBake = meals.find((m) => m.title.startsWith("Egg Bake"));
    expect(eggBake).toBeDefined();
    // The recipe quantities belong in practical_notes, not the menu prose.
    expect(eggBake!.displayDescription).not.toMatch(/9×13|1½ cups/);
    expect(eggBake!.practicalNotes).toMatch(/9×13/);
  });

  it("only surfaces upcoming days on the home feed", async () => {
    const upcoming = await getUpcomingMeals(5);
    const all = await getAllMeals();
    // Every meal in the trip is in the past relative to "today" only if the
    // trip has ended; otherwise upcoming must be a chronological prefix.
    if (upcoming.length > 0) {
      const firstUpcoming = all.findIndex((m) => m.id === upcoming[0]!.id);
      expect(firstUpcoming).toBeGreaterThanOrEqual(0);
      expect(upcoming.map((m) => m.id)).toEqual(
        all.slice(firstUpcoming, firstUpcoming + upcoming.length).map((m) => m.id),
      );
    }
    expect(upcoming.length).toBeLessThanOrEqual(5);
  });
});
