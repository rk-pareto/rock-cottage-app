import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email · Rock Cottage" };

export default async function CheckEmailPage({
  searchParams,
}: PageProps<"/auth/check-email">) {
  const params = await searchParams;
  const raw = params.email;
  const email = Array.isArray(raw) ? raw[0] : raw;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber text-3xl">
        📬
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a sign-in link{email ? " to " : ""}
          {email ? <span className="font-semibold text-ink">{email}</span> : ""}. Tap it on
          this phone and you&apos;re in — you shouldn&apos;t need to do this again all week.
        </p>
      </div>
      <p className="text-xs text-muted">
        No link after a minute? Check spam, then{" "}
        <Link href="/auth/sign-in" className="font-semibold text-lake">
          try again
        </Link>
        .
      </p>
    </main>
  );
}
