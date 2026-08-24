import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

// Tests must never touch production. The development branch host differs from
// the production one, so refuse to run if they've been pointed at the same DB.
const url = process.env.DATABASE_URL ?? "";
if (url.includes("ep-small-bread-aucvmlk4")) {
  throw new Error(
    "Refusing to run tests against the production Neon branch. Point DATABASE_URL at 'development'.",
  );
}

// Server actions call these Next APIs; outside the Next runtime they're no-ops.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
