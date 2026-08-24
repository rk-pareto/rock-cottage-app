import "server-only";
import { headers } from "next/headers";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import {
  NEON_AUTH_HEADER_MIDDLEWARE_NAME,
  extractNeonAuthCookies,
} from "@neondatabase/auth/server";

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

export type SessionUser = { id: string; email?: string | null };

/**
 * Read the signed-in user, tolerating a render context.
 *
 * When Neon Auth returns a refreshed cookie, the SDK writes it through
 * `next/headers` — which throws inside a server component ("Cookies can only
 * be modified in a Server Action or Route Handler"). Neon extends a session's
 * expiry about a day after sign-in, so without a fallback every page would
 * start failing mid-week. Dropping that cookie costs nothing: the refresh only
 * bumps the expiry, the token value is unchanged.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const { data: session } = await auth.getSession();
    return session?.user ?? null;
  } catch (error) {
    console.warn("getSession could not write its refreshed cookie; reading directly", error);
    return readSessionUpstream();
  }
}

async function readSessionUpstream(): Promise<SessionUser | null> {
  const baseUrl = process.env.NEON_AUTH_BASE_URL!.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/get-session`, {
    headers: {
      Cookie: extractNeonAuthCookies(await headers()),
      [NEON_AUTH_HEADER_MIDDLEWARE_NAME]: "true",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { user?: SessionUser } | null;
  return data?.user ?? null;
}
