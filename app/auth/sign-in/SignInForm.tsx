"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMagicLink } from "@/lib/auth/actions";

export function SignInForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);
    startTransition(async () => {
      const result = await sendMagicLink(trimmed);
      if (result.ok) {
        router.push(`/auth/check-email?email=${encodeURIComponent(trimmed)}`);
      } else {
        setError(result.error);
        setPending(false);
      }
    });
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
