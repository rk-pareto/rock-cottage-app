import { BRINGING_CATEGORIES, type BringingCategory } from "@/db/schema";

/**
 * Labels and descriptions for the Public Good categories. The description is
 * shown while someone's picking a category, so it has one job: help them
 * tell a shared item apart from something that's really tied to one dish or
 * meal — a dish's ingredients belong with that meal, not here, because
 * there's rarely enough of them to go around the way a bottle of oil is.
 * Order here is display order everywhere the list is shown.
 */
export const BRINGING_CATEGORY_INFO: Record<
  BringingCategory,
  { label: string; description: string }
> = {
  cooking: {
    label: "Cooking",
    description:
      "Kitchen stuff anyone can use — oil, spices, condiments, foil, pots and pans. Not the ingredients for your dish; those go with the meal, not here.",
  },
  toys_games: {
    label: "Toys & Games",
    description: "Board games, cards, puzzles — anything for downtime indoors.",
  },
  drinks: {
    label: "Drinks",
    description: "Shared drinks — soda, coffee, alcohol, mixers.",
  },
  recreation: {
    label: "Recreation",
    description: "Gear for getting outside — bikes, kayaks, sports and beach stuff.",
  },
  household: {
    label: "Household Supplies",
    description: "Paper towels, toiletries, cleaning supplies, batteries — for the house, not a meal.",
  },
  other: {
    label: "Other",
    description: "Doesn't fit anywhere else.",
  },
};

export { BRINGING_CATEGORIES };
export type { BringingCategory };
