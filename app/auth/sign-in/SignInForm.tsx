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
       * Posted from the browser to our own Neon Auth proxy on purpose. Neon
       * builds both the magic-link URL and its callback from the request's
       * `Origin` header, and only a real browser request carries one — behind
       * Railway's proxy the server-side fallback
       * (`new URL(request.url).origin`) resolves to the container's internal
       * address and the emailed link points at localhost.
       *
       * `callbackURL` must stay relative; an absolute URL is rejected as
       * INVALID_CALLBACK_URL even when that exact origin is whitelisted. Neon
       * expands it against the origin and appends the one-time verifier that
       * `/auth/callback` trades for a session cookie on this domain.
       */
      const response = await fetch("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed, callbackURL: "/auth/callback" }),
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
        <span className="label text-muted">Email</span>
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
          className="tap rounded-xl border border-line bg-card px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
        />
      </label>

      {error ? <p className="text-sm font-bold text-clay">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || email.trim().length === 0}
        className="tap rounded-xl bg-ink px-4 py-3.5 text-[0.9375rem] font-extrabold tracking-tight text-paper transition active:scale-[0.99] disabled:opacity-30"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>

      <p className="text-xs text-muted">
        Rock Cottage is private. Only the five of us can get in.
      </p>
    </form>
  );
}
