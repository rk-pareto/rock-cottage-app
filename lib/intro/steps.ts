/**
 * The first-login tour: one card per bottom-nav tab, plus Public Goods, which
 * has no tab of its own but is the one thing on the More screen people need to
 * be told about rather than left to find.
 *
 * Content lives here rather than in the component so the shape of the tour —
 * the number of cards and which tab each one points at — is a fact the tests
 * can hold onto.
 */
export type IntroStepId =
  | "welcome"
  | "home"
  | "meals"
  | "dogs"
  | "memories"
  | "more"
  | "publicGoods";

export type IntroStep = {
  id: IntroStepId;
  /** The `data-tour` value of the nav tab to spotlight; null dims everything. */
  target: string | null;
  label: string;
  title: string;
  body: string;
};

/** `dogsLabel` matches the nav tab — "Alice" alone, "Dogs" once Juno is on. */
export function introSteps(dogsLabel: string): IntroStep[] {
  return [
    {
      id: "welcome",
      target: null,
      label: "Welcome",
      title: "This is the cottage app",
      body: "Meals, the dogs, the shopping list and everyone's photos, in one place for the week. Six quick cards and you'll know where everything lives.",
    },
    {
      id: "home",
      target: "nav-home",
      label: "Tab 1",
      title: "Home",
      body: "The whole week at a glance: what's cooking next, how the dogs are doing, what we still need from town — with photos from the week mixed in. If you're on for a meal, this is where it asks you to confirm it.",
    },
    {
      id: "meals",
      target: "nav-meals",
      label: "Tab 2",
      title: "Meals",
      body: "Every breakfast, lunch and dinner of the week, day by day, with who's cooking each one. Cooking something different than what's listed? Rename it from the prompt on Home.",
    },
    {
      id: "dogs",
      target: "nav-dogs",
      label: "Tab 3",
      title: dogsLabel,
      body: "Outside, poop, fed — one tap each, recorded right then under your name, so nobody has to ask when she last went out. Tap the status line to see the full history, fix a time, or delete a mistake.",
    },
    {
      id: "memories",
      target: "nav-memories",
      label: "Tab 4",
      title: "Memories",
      body: "Everyone's photos and videos from the week in one gallery. Add yours straight from your camera roll, heart the ones you love, and share or download any of them.",
    },
    {
      id: "more",
      target: "nav-more",
      label: "Tab 5",
      title: "More",
      body: "The rest of it: the shopping list anyone can add to, Public Goods, cottage info — address, wifi, who to call — and your account.",
    },
    {
      id: "publicGoods",
      target: "nav-more",
      label: "Under More",
      title: "Public Goods",
      body: "The shared stuff you're bringing — oil and spices, drinks, board games, paper towels, the kayak. Claim yours so we don't end up with four bottles of mustard, then tick it off once it's packed.",
    },
  ];
}
