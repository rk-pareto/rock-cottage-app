"use client";

import { useState, useTransition } from "react";
import { signOut } from "@/lib/auth/actions";

export function SignOutButton({ className = "" }: { className?: string }) {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        startTransition(() => {
          void signOut();
        });
      }}
      className={`tap rounded-2xl border border-line bg-card px-4 py-3 text-base font-bold text-clay transition active:bg-paper disabled:opacity-50 ${className}`}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
