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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="label text-muted">Almost in</p>
        <h1 className="mt-2 font-display text-[2.25rem] leading-tight text-ink">
          Check your email
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          We sent a sign-in link{email ? " to " : ""}
          {email ? <span className="font-bold text-ink">{email}</span> : ""}. Tap it on
          this phone and you&apos;re in — you shouldn&apos;t need to do this again all week.
        </p>
      </div>
      <p className="text-xs text-muted">
        No link after a minute? Check spam, then{" "}
        <Link
          href="/auth/sign-in"
          className="font-bold text-lake underline decoration-lake/30 underline-offset-[3px]"
        >
          try again
        </Link>
        .
      </p>
    </main>
  );
}
