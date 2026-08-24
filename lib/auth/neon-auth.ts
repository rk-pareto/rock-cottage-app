import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Neon Auth (Better Auth under the hood). One singleton for the whole app —
 * `baseUrl` comes from `neon neon-auth status`, and the cookie secret must
 * stay stable across deployments or everyone gets signed out.
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
