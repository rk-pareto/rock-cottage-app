"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);
    try {
      /*
       * Posted from the browser to our own Neon Auth proxy on purpose. The
       * magic-link URL is built from the request's `Origin` header, and only a
       * real browser request carries one — behind Railway's proxy the
       * server-side fallback (`new URL(request.url).origin`) resolves to the
       * container's internal address and the emailed link points at localhost.
       *
       * `callbackURL` must stay relative; an absolute URL is rejected as
       * INVALID_CALLBACK_URL even when that exact origin is whitelisted.
       */
      const response = await fetch("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed, callbackURL: "/" }),
      });

      if (!response.ok) {
        setError("We couldn't send that link. Check the address and try again.");
        setPending(false);
        return;
      }

      router.push(`/auth/check-email?email=${encodeURIComponent(trimmed)}`);
    } catch {
      setError("We couldn't send that link. Try again in a moment.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="tap rounded-2xl border border-line bg-card px-4 py-3 text-base text-ink outline-none focus:border-pine"
        />
      </label>

      {error ? <p className="text-sm font-semibold text-clay">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || email.trim().length === 0}
        className="tap rounded-2xl bg-pine px-4 py-3.5 text-base font-bold text-white transition active:bg-pine-dark disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>

      <p className="text-center text-xs text-muted">
        Rock Cottage is private. Only the five of us can get in.
      </p>
    </form>
  );
}
