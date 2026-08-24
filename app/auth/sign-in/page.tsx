import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/auth/membership";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · Rock Cottage" };
export const dynamic = "force-dynamic";

/**
 * Why a sign-in link can bounce someone back here. Links are single-use and
 * good for 30 minutes, and mail apps that pre-fetch links can burn one before
 * the person taps it — so say what happened rather than silently re-prompting.
 */
const LINK_ERRORS: Record<string, string> = {
  EXPIRED_TOKEN: "That link has expired. Here's a fresh one.",
  INVALID_TOKEN: "That link has already been used. Send yourself a new one.",
  LINK_INVALID: "That link didn't work. Send yourself a new one.",
  LINK_FAILED: "We couldn't finish signing you in. Try the link again.",
};

export default async function SignInPage({ searchParams }: PageProps<"/auth/sign-in">) {
  const membership = await getMembership();
  if (membership.state === "member") redirect("/");

  const raw = (await searchParams).error;
  const code = Array.isArray(raw) ? raw[0] : raw;
  const notice = code ? (LINK_ERRORS[code] ?? LINK_ERRORS.LINK_INVALID) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-7 px-6 py-12">
      {/* The wordmark is the whole brand moment: serif, oversized, left-aligned
          against a rule. No badge, no emoji. */}
      <header>
        <p className="label text-muted">Port Carling · Aug 31 – Sep 6</p>
        <h1 className="mt-3 border-b border-line pb-5 font-display text-[3rem] leading-[0.95] text-ink">
          Rock
          <br />
          Cottage
        </h1>
      </header>
      {notice ? (
        <p className="rounded-xl border border-clay/25 bg-clay/5 px-4 py-3 text-sm font-bold text-clay">
          {notice}
        </p>
      ) : null}
      <SignInForm />
    </main>
  );
}
