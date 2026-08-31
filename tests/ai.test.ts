import { describe, expect, it } from "vitest";
import { buildMealDescriptionPrompt, extractMealDescription } from "@/lib/ai/mealDescription";

/**
 * The pure pieces of the meal-description call, against fabricated prompts
 * and Ollama response shapes. No network call here — `generateMealDescription`
 * itself is exercised only manually, same as `tests/transcode.smoke.test.ts`
 * covers the real ffmpeg pass.
 */

describe("buildMealDescriptionPrompt", () => {
  it("carries the title through as the user turn", () => {
    const { user } = buildMealDescriptionPrompt("Tacos");
    expect(user).toBe("Tacos");
  });

  it("briefs the model on the spec's style: elaborate, a joke, no logistics", () => {
    const { system } = buildMealDescriptionPrompt("Tacos");
    expect(system).toMatch(/pretentious/i);
    expect(system).toMatch(/one short paragraph/i);
    expect(system).toMatch(/never.*(operational|logistical|practical)/i);
    // The spec's own example, so the model has something concrete to imitate.
    expect(system).toMatch(/Pulled Pork/);
  });
});

describe("extractMealDescription", () => {
  it("pulls trimmed content out of a well-formed chat response", () => {
    const body = { message: { role: "assistant", content: "  A delicate reduction.  " } };
    expect(extractMealDescription(body)).toBe("A delicate reduction.");
  });

  it("truncates a response that ignores the length brief", () => {
    const long = "x".repeat(1000);
    const body = { message: { content: long } };
    const result = extractMealDescription(body);
    expect(result?.length).toBeLessThanOrEqual(600);
  });

  it.each([
    null,
    undefined,
    "a string, not an object",
    {},
    { message: null },
    { message: {} },
    { message: { content: 42 } },
    { message: { content: "   " } },
  ])("returns null for a malformed body: %j", (body) => {
    expect(extractMealDescription(body)).toBeNull();
  });
});
