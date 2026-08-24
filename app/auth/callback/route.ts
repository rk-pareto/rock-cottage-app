import { NextResponse } from "next/server";
import {
  NEON_AUTH_HEADER_MIDDLEWARE_NAME,
  NEON_AUTH_SESSION_COOKIE_NAME,
  extractNeonAuthCookies,
  handleAuthResponse,
} from "@neondatabase/auth/server";

/**
 * Where a magic link lands after Neon Auth has checked the token.
 *
 * The emailed link points at the Neon Auth host, not at us, so the session
 * cookie Neon sets belongs to *its* domain — this app can never read it. What
 * Neon hands back instead is a one-time verifier on the callback URL, and
 * exchanging that for a cookie on our own domain is the app's job. Nothing did
 * it before, which is why a valid link dropped people straight back on the
 * sign-in screen, forever.
 *
 * The exchange is a `get-session` call carrying the verifier: Neon answers with
 * the session token, and `handleAuthResponse` rewrites it (plus the cached
 * `session_data`) as cookies for this domain.
 *
 * The Next.js SDK does this in middleware, but only for OAuth — it insists on a
 * session-challenge cookie that the magic-link flow never sets.
 */

export const dynamic = "force-dynamic";

/** Not exported by the SDK; it is the param Neon appends to the callback URL. */
const VERIFIER_PARAM = "neon_auth_session_verifier";

const AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL!;
const COOKIE_SECRET = process.env.NEON_AUTH_COOKIE_SECRET!;

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const verifier = requestUrl.searchParams.get(VERIFIER_PARAM);

  if (!verifier) {
    // Already signed in on this device? Then the link was simply redundant.
    if (extractNeonAuthCookies(request.headers).includes(NEON_AUTH_SESSION_COOKIE_NAME)) {
      return redirectTo(requestUrl, "/", []);
    }
    // Otherwise the link expired, was already used, or a mail client opened it
    // first — Neon reports which in `error`.
    const code = requestUrl.searchParams.get("error") ?? "LINK_INVALID";
    console.warn("auth callback without verifier", {
      params: [...requestUrl.searchParams.keys()],
    });
    return redirectTo(requestUrl, `/auth/sign-in?error=${encodeURIComponent(code)}`, []);
  }

  const upstreamUrl = new URL(`${AUTH_BASE_URL.replace(/\/$/, "")}/get-session`);
  upstreamUrl.searchParams.set(VERIFIER_PARAM, verifier);

  let cookies: string[];
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Cookie: extractNeonAuthCookies(request.headers),
        Origin: requestUrl.origin,
        [NEON_AUTH_HEADER_MIDDLEWARE_NAME]: "true",
      },
    });
    const handled = await handleAuthResponse(upstream, AUTH_BASE_URL, { secret: COOKIE_SECRET });
    cookies = handled.headers.getSetCookie();
  } catch (error) {
    console.error("auth callback exchange failed", error);
    return redirectTo(requestUrl, "/auth/sign-in?error=LINK_FAILED", []);
  }

  const signedIn = cookies.some((cookie) =>
    cookie.startsWith(`${NEON_AUTH_SESSION_COOKIE_NAME}=`),
  );
  if (!signedIn) {
    console.warn("auth callback exchange returned no session cookie");
    return redirectTo(requestUrl, "/auth/sign-in?error=LINK_INVALID", []);
  }

  return redirectTo(requestUrl, safeNext(requestUrl.searchParams.get("next")), cookies);
}

/**
 * Only ever bounce to a path on this app — `next` rides in on a URL from an
 * email, so anything absolute or protocol-relative would be an open redirect.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

function redirectTo(requestUrl: URL, path: string, cookies: string[]): Response {
  const response = NextResponse.redirect(new URL(path, requestUrl), 303);
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
