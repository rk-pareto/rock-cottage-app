"use server";

import { redirect } from "next/navigation";
import { auth } from "./neon-auth";

export type SignInResult = { ok: true } | { ok: false; error: string };

/**
 * Send a magic link. Done as a server action so the browser never talks to
 * Neon Auth directly and no client key is needed.
 *
 * Note we deliberately do not reveal whether the address is on the cottage
 * allowlist — that check happens after the link is followed.
 */
export async function sendMagicLink(email: string): Promise<SignInResult> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 255) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  try {
    // Neon Auth requires a *relative* callback; it resolves against the
    // branch's trusted domain. An absolute URL is rejected as
    // INVALID_CALLBACK_URL even when that exact origin is whitelisted.
    const { error } = await auth.signIn.magicLink({
      email: trimmed,
      callbackURL: "/",
    });
    if (error) {
      console.error("sendMagicLink failed", error);
      return { ok: false, error: "We couldn't send that link. Try again in a moment." };
    }
  } catch (error) {
    console.error("sendMagicLink threw", error);
    return { ok: false, error: "We couldn't send that link. Try again in a moment." };
  }

  return { ok: true };
}

export async function signOut(): Promise<void> {
  try {
    await auth.signOut();
  } catch (error) {
    console.error("signOut failed", error);
  }
  redirect("/auth/sign-in");
}
