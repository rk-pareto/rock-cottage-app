"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { replayIntro } from "@/app/(app)/intro/actions";

/**
 * The way back into the intro tour. Shaped exactly like the links either side
 * of it on the More screen, because from the outside it is one — it just opens
 * over the current page instead of navigating. The tour itself lives in the app
 * layout and keys off `members.intro_seen_at`, so clearing that and refreshing
 * is the whole trick; no navigation required.
 */
export function ReplayIntroRow() {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        startTransition(async () => {
          const result = await replayIntro();
          setPending(false);
          if (result.ok) router.refresh();
          else toast(result.error, "error");
        });
      }}
      className="tap flex w-full items-center gap-4 bg-card px-4 py-3.5 text-left transition-colors hover:bg-subtle active:bg-subtle disabled:opacity-60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink-soft">
        {/* A compass — the tour is about learning where things are. */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="8" />
          <path d="m15 9-1.9 4.1L9 15l1.9-4.1z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-extrabold tracking-tight text-ink">
          Intro Tour
        </span>
        <span className="block text-sm text-muted">
          {pending ? "Starting…" : "A quick walk through the app"}
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-lg text-line-strong">
        ›
      </span>
    </button>
  );
}
