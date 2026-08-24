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
      className={`tap rounded-xl border border-line bg-card px-4 py-3 text-[0.9375rem] font-extrabold tracking-tight text-clay transition-colors hover:border-clay/40 hover:bg-clay/5 active:bg-clay/10 disabled:opacity-50 ${className}`}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
