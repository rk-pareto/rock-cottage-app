"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh server data when the app regains focus or becomes visible. */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [router]);

  return null;
}
