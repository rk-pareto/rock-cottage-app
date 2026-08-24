"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/time";

/**
 * Renders "47 min ago" and keeps it honest while the page stays open.
 * The first render uses the server-computed string so hydration matches;
 * only after mount do we start recomputing.
 */
export function RelativeTime({
  iso,
  initial,
  className = "",
}: {
  iso: string;
  initial: string;
  className?: string;
}) {
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    const tick = () => setLabel(relativeTime(new Date(iso)));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [iso]);

  return <span className={className}>{label}</span>;
}
