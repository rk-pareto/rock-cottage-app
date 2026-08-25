import type { MealType } from "@/db/schema";

/** Cottage members — the access allowlist. Emails must be lowercase. */
export const MEMBERS = [
  { email: "ryankrook@gmail.com", displayName: "Ryan", isAdmin: true },
  { email: "zuzannachociej@gmail.com", displayName: "Zuzanna", isAdmin: false },
  { email: "chociejgreg@gmail.com", displayName: "Greg", isAdmin: false },
  { email: "danakrook@gmail.com", displayName: "Dana", isAdmin: false },
  { email: "sean.hemraj@live.com", displayName: "Sean", isAdmin: false },
] as const;

export const PETS = [
  { slug: "alice", name: "Alice", sortOrder: 1 },
  { slug: "juno", name: "Juno", sortOrder: 2 },
] as const;

export type SeedMeal = {
  mealDate: string;
  mealType: MealType;
  title: string;
  displayDescription: string;
  practicalNotes?: string;
  /** Relative path under public/, e.g. "meals/chili.jpg". Reused across
   *  repeats of the same dish (e.g. "Whatever's Left"). */
  photo?: string;
  /** Member emails. Empty = everyone, rendered as "Everyone". */
  responsible: string[];
};

const RYAN = "ryankrook@gmail.com";
const DANA = "danakrook@gmail.com";
const SEAN = "sean.hemraj@live.com";
const DS = [DANA, SEAN];

/**
 * Rock Cottage, Aug 31 – Sep 6 2026. Descriptions are deliberately overwrought
 * — the joke is a tasting-menu card describing cottage food.
 */
export const MEALS: SeedMeal[] = [
  {
    mealDate: "2026-08-31",
    mealType: "dinner",
    title: "Chili",
    displayDescription:
      "A patient braise of beef and heirloom legumes, coaxed over many hours into a deep, brick-red concentrate perfumed with toasted cumin and smoked chilies. Finished tableside with a cultured cream and a drift of aged cheddar.",
    photo: "meals/chili.jpg",
    practicalNotes:
      "Ryan makes it ahead and brings it — double batch for 8–9. Optional toppers: shredded cheddar, sour cream. Bread or cornbread for dipping.",
    responsible: [RYAN],
  },
  {
    mealDate: "2026-09-01",
    mealType: "breakfast",
    title: "Pancakes, Sausage & Fruit",
    displayDescription:
      "Aerated buttermilk gateaux, griddled to a burnished gold and stacked with architectural intent, served alongside coarse-ground breakfast sausage and a still-life of orchard fruit. Accompanied by a reduction of Canadian maple, harvested from actual trees.",
    photo: "meals/pancakes-sausage-fruit.jpg",
    practicalNotes: "Dana & Sean bring the dry goods and maple syrup. Bananas and berries.",
    responsible: DS,
  },
  {
    mealDate: "2026-09-01",
    mealType: "lunch",
    title: "Grilled Cheese & Veggie Sticks",
    displayDescription:
      "A study in contrast: cultured cheese brought to a molten state between two planes of butter-lacquered pain de mie, crisped to an audible shatter. Presented with a crudité of garden vegetables cut on the bias.",
    photo: "meals/grilled-cheese-veggie-sticks.jpg",
    practicalNotes: "Good cheese (~1 lb block), 1–2 loaves, butter. Carrots, cucumber, peppers.",
    responsible: [],
  },
  {
    mealDate: "2026-09-01",
    mealType: "dinner",
    title: "Make-Your-Own Pizza",
    displayDescription:
      "An interactive expression of the chef's philosophy, in which the guest assumes authorship. Hand-stretched dough, a bright San Marzano-adjacent conserve, and a curated selection of charcuterie and market vegetables, fired until blistered.",
    photo: "meals/make-your-own-pizza.jpg",
    practicalNotes:
      "Dough, sauce, mozzarella. Toppings: pepperoni, mushrooms, peppers, olives, onions. Optional bagged green salad on the side.",
    responsible: DS,
  },
  {
    mealDate: "2026-09-02",
    mealType: "breakfast",
    title: "Eggs, Toast & Fruit",
    displayDescription:
      "Farm eggs prepared to the guest's specification, plated with hearth-toasted bread and a cultured butter allowed to come to temperature. A composition of seasonal fruit provides acidity and counterpoint.",
    photo: "meals/eggs-toast-fruit.jpg",
    practicalNotes: "About a dozen eggs, toast bread, butter, fresh fruit.",
    responsible: DS,
  },
  {
    mealDate: "2026-09-02",
    mealType: "lunch",
    title: "Hot Dogs & Raw Veg",
    displayDescription:
      "Emulsified sausage in the classical Frankfurter tradition, gently poached then finished over open flame, cradled in a soft enriched roll. A trio of house condiments and a vegetable tray complete the plate.",
    photo: "meals/hot-dogs-raw-veg.jpg",
    practicalNotes: "~2 pkgs hot dogs, 1 pkg buns. Ketchup, mustard, relish. Veggie tray.",
    responsible: [],
  },
  {
    mealDate: "2026-09-02",
    mealType: "dinner",
    title: "Pulled Pork & Burrito Bowls",
    displayDescription:
      "Slow-roasted pork shoulder, delicately pulled and lacquered in a smoky-sweet reduction, arranged over steamed long-grain rice and heritage black beans. Accompanied by sweet corn grilled to a charred, buttery finish.",
    photo: "meals/pulled-pork-burrito-bowls.jpg",
    practicalNotes:
      "Ryan brings the pork shoulder made ahead and frozen. Corn on the cob (8–10 ears) is the vegetable for this meal. Rice, black beans, salsa, sour cream, cheddar. Optional: avocado, tortilla chips.",
    responsible: [RYAN],
  },
  {
    mealDate: "2026-09-03",
    mealType: "breakfast",
    title: "Waffles, Bacon & Fruit",
    displayDescription:
      "Belgian-method batter rested overnight and pressed into a lattice of remarkable structural integrity, achieving simultaneous crispness and yield. Served with dry-cured pork belly and a maple emulsion.",
    photo: "meals/waffles-bacon-fruit.jpg",
    practicalNotes: "Waffle mix, ~2 lb bacon, maple syrup, fresh fruit.",
    responsible: DS,
  },
  {
    mealDate: "2026-09-03",
    mealType: "lunch",
    title: "Sloppy Joes & Coleslaw",
    displayDescription:
      "Coarsely ground beef braised in a piquant tomato lacquer with notes of Worcestershire and unrefined sugar, deliberately served in a state of structural collapse. Napkins are provided without judgement.",
    photo: "meals/sloppy-joes-coleslaw.jpg",
    practicalNotes:
      "Made on-site from scratch: 2 lb ground beef, onion, tomato paste, ketchup, Worcestershire, hamburger buns. Coleslaw from red cabbage, mustard and mayo. Broccoli on the side.",
    responsible: [RYAN],
  },
  {
    mealDate: "2026-09-03",
    mealType: "dinner",
    title: "Chicken Skewers, Greek Salad & Lemon Potatoes",
    displayDescription:
      "Marinated poultry threaded onto wooden batons and grilled over live fire until just yielding. Served with a Hellenic composition of vine tomato, cucumber, brined olive and barrel-aged feta, and potatoes confited in lemon, garlic and olive oil.",
    photo: "meals/chicken-skewers-greek-salad-lemon-potatoes.jpg",
    practicalNotes:
      "~3 lb boneless thighs or breasts, cut for skewers. Dana & Sean bring the wooden skewers.",
    responsible: DS,
  },
  {
    mealDate: "2026-09-04",
    mealType: "breakfast",
    title: "Scrambled Eggs with Yogurt & Granola",
    displayDescription:
      "Farm eggs whisked and folded over gentle heat into soft, custardy curds, finished with a drift of aged cheddar. Served with cultured yogurt and a toasted oat cluster.",
    photo: "meals/egg-bake-yogurt-granola.jpg",
    practicalNotes:
      "30 eggs · 1½ cups milk · 1 cup shredded cheddar · salt & pepper. Yogurt (2 × 900 g tubs) and granola (oats, almonds, cashews, seeds) on the side. Feeds 5 adults + 3 young kids.",
    responsible: [RYAN],
  },
  {
    mealDate: "2026-09-04",
    mealType: "lunch",
    title: "Beef Shishkabobs",
    displayDescription:
      "Sirloin cubes bathed in a soy-and-garlic marinade, alternated with sweet onion and capsicum, then grilled to a decisive medium. The skewer functions as both cooking vessel and cutlery.",
    photo: "meals/beef-shishkabobs.jpg",
    practicalNotes:
      "~3 lb sirloin. Add rice or pita and a simple green salad — meat on a stick alone is thin.",
    responsible: [],
  },
  {
    mealDate: "2026-09-04",
    mealType: "dinner",
    title: "Burgers, Fries & Salad",
    displayDescription:
      "Freshly ground chuck formed into generous patties, seared hard for maximal Maillard development and crowned with a slice of cheese permitted to melt without interference. Served with twice-cooked potato batons and a lightly dressed green salad.",
    photo: "meals/burgers-fries-salad.jpg",
    practicalNotes:
      "~2.5 lb patties, 1–2 pkgs buns, cheese slices, lettuce, tomato, onion, condiments. ~3 bags frozen fries. Salad greens + dressing.",
    responsible: DS,
  },
  {
    mealDate: "2026-09-05",
    mealType: "breakfast",
    title: "Whatever's Left",
    displayDescription:
      "A spontaneous tasting driven entirely by the contents of the refrigerator. The kitchen exercises no authority here; guests are invited to forage according to conscience and appetite.",
    photo: "meals/whatevers-left.jpg",
    practicalNotes: "Eggs, yogurt, granola, fruit, toast — whatever survived the week.",
    responsible: [],
  },
  {
    mealDate: "2026-09-05",
    mealType: "lunch",
    title: "Chicken Salad",
    displayDescription:
      "Poached chicken hand-torn and bound in a house aioli, punctuated by the vegetal snap of celery and the briny bite of dill pickle. Presented on soft bread or in a leaf of butter lettuce, per the guest's disposition.",
    photo: "meals/chicken-salad.jpg",
    practicalNotes:
      "Ryan brings it made ahead. ~3 lb cooked chicken, mayo, celery, dill pickles. Bread or lettuce to serve on.",
    responsible: [RYAN],
  },
  {
    mealDate: "2026-09-05",
    mealType: "dinner",
    title: "Garlic Shrimp & Sesame Soba Noodles",
    displayDescription:
      "Wild shrimp seared in a foaming garlic butter until barely opaque, set against chilled buckwheat noodles dressed in toasted sesame and scattered with scallion. A bright, restrained finish to the week.",
    photo: "meals/garlic-shrimp-sesame-soba-noodles.jpg",
    practicalNotes:
      "Dana & Sean handle this one. Shrimp, garlic, butter, soba noodles, toasted sesame, scallion. Leftovers are the backup if the week has gone sideways.",
    responsible: DS,
  },
  {
    mealDate: "2026-09-06",
    mealType: "breakfast",
    title: "Whatever's Left",
    displayDescription:
      "The final foraging. The kitchen's ambition on departure day extends precisely as far as eating down the refrigerator, and no further.",
    photo: "meals/whatevers-left.jpg",
    practicalNotes: "Checkout is 10:00 a.m. — eat fast.",
    responsible: [],
  },
  {
    mealDate: "2026-09-06",
    mealType: "lunch",
    title: "Leftovers",
    displayDescription:
      "A retrospective. Every dish of the preceding week, presented once more in diminished quantity, celebrating the achievements of the residency and the triumph of not wasting food.",
    photo: "meals/leftovers.jpg",
    responsible: [],
  },
];
