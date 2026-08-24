import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/auth/membership";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · Rock Cottage" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const membership = await getMembership();
  if (membership.state === "member") redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-pine text-3xl">
          🌲
        </div>
        <h1 className="font-display text-3xl font-semibold text-ink">Rock Cottage</h1>
        <p className="mt-1 text-sm text-muted">Port Carling · Aug 31 – Sep 6</p>
      </header>
      <SignInForm />
    </main>
  );
}
