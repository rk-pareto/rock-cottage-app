import "server-only";

/**
 * Runtime AI meal descriptions (spec §9.4 — deferred in V1, wired up here).
 * `display_description` was always meant to hold "AI-generated restaurant
 * prose"; renaming a meal used to just clear it and leave it blank forever.
 * This regenerates it instead, through Ollama's cloud API.
 *
 * Same graceful-degradation shape as `lib/storage/s3.ts`'s
 * `isStorageConfigured()`: no key configured, and the caller's existing
 * behavior (clear the description) is unchanged — nothing here is load-
 * bearing for the rename to work.
 */

const DEFAULT_MODEL = "glm-5.3-flash:cloud";
const DEFAULT_BASE_URL = "https://ollama.com";
const REQUEST_TIMEOUT_MS = 20_000;
/** These are meant to be one short paragraph (spec example is ~2 sentences);
 *  this is a backstop against a model that ignores the brief, not a target. */
const MAX_DESCRIPTION_LENGTH = 600;

export function isAiConfigured(): boolean {
  return Boolean(process.env.OLLAMA_API_KEY?.trim());
}

/**
 * The style brief, straight from the spec: elaborate restaurant-menu prose,
 * obviously a joke, no operational notes. Pure so it can be unit tested
 * without a network call.
 */
export function buildMealDescriptionPrompt(title: string): { system: string; user: string } {
  return {
    system:
      "You write absurdly pretentious, high-end restaurant tasting-menu " +
      "descriptions for home-cooked meals at a lake cottage. Given a plain " +
      "meal name, write one short paragraph (one to three sentences) in " +
      "elaborate menu prose — delicate verbs, unnecessary technique, precious " +
      "plating language — that is obviously, deliberately over-the-top for " +
      "what the dish actually is. Never break character, never explain the " +
      "joke, never add practical or logistical notes (timing, who's cooking, " +
      "ingredients to buy). Output only the description itself, no title, " +
      "quotes, or markdown.\n\n" +
      'Example — meal "Pulled Pork + Coleslaw":\n' +
      "Slow-roasted pork, delicately pulled and lacquered in a smoky-sweet " +
      "reduction, accompanied by crisp cabbage dressed in a sharp mustard " +
      "emulsion.",
    user: title,
  };
}

/** Pulls the model's reply text out of an Ollama `/api/chat` response body,
 *  tolerating anything malformed. Pure and unit-tested against sample JSON. */
export function extractMealDescription(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const message = (body as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string") return null;

  const trimmed = content.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > MAX_DESCRIPTION_LENGTH
    ? trimmed.slice(0, MAX_DESCRIPTION_LENGTH).trim()
    : trimmed;
}

/**
 * Generate a new fancy description for a meal's title. Never throws — a
 * failure here (missing key, network error, timeout, a model that returns
 * nonsense) just means the description stays blank, same as today's
 * behavior before this existed.
 */
export async function generateMealDescription(title: string): Promise<string | null> {
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildMealDescriptionPrompt(title);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("generateMealDescription: Ollama returned", response.status);
      return null;
    }

    return extractMealDescription(await response.json());
  } catch (error) {
    console.error("generateMealDescription failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
