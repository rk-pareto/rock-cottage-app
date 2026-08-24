/**
 * Centralised feature flags (spec §29). Never read process.env for flags
 * anywhere else — server-side authorization depends on these too, not just
 * conditional rendering.
 */
function parseBooleanFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export const features = {
  get junoEnabled(): boolean {
    return parseBooleanFlag(process.env.FEATURE_JUNO_ENABLED);
  },
};

/** Pet slugs currently permitted to receive events / be rendered. */
export function enabledPetSlugs(): string[] {
  return features.junoEnabled ? ["alice", "juno"] : ["alice"];
}

export function isPetEnabled(slug: string): boolean {
  return enabledPetSlugs().includes(slug);
}

/** Bottom-nav label for the dogs tab (spec §10). */
export function dogsNavLabel(): string {
  return features.junoEnabled ? "Dogs" : "Alice";
}
