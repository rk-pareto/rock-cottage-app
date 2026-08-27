"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { Lightbox, type LightboxItem } from "./Lightbox";

export type FeedLightboxItem = LightboxItem;

const FeedLightboxContext = createContext<((id: string) => void) | null>(null);

/** Lets any photo tile in the feed open the shared viewer without each tile
 *  needing to know about its neighbors. */
export function useFeedLightbox(): (id: string) => void {
  const open = useContext(FeedLightboxContext);
  if (!open) {
    throw new Error("useFeedLightbox must be used within a FeedLightboxProvider");
  }
  return open;
}

/**
 * Wraps the home feed so any photo tile inside it can open a fullscreen,
 * swipeable viewer over the *whole* set of memories passed in — not just
 * itself. One dialog shared by every tile, rather than each carrying its own.
 *
 * Deliberately lighter than the gallery's lightbox (`/memories`): no
 * favorite, share, or delete here, since home only has the thumbnail-level
 * data for its random draw. "Open in Memories" is the door to those.
 */
export function FeedLightboxProvider({
  items,
  children,
}: {
  items: FeedLightboxItem[];
  children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const index = items.findIndex((m) => m.id === openId);
  const memory = index >= 0 ? items[index] : null;

  return (
    <FeedLightboxContext.Provider value={setOpenId}>
      {children}

      {memory ? (
        <Lightbox
          items={items}
          index={index}
          title={memory.uploadedBy}
          onIndexChange={(next) => setOpenId(items[next].id)}
          onClose={() => setOpenId(null)}
          footer={
            <Link
              href="/memories"
              className="tap flex-1 rounded-xl bg-white/12 px-4 py-3 text-center text-xs font-extrabold tracking-tight text-white transition-colors hover:bg-white/20"
            >
              Open in Memories
            </Link>
          }
        />
      ) : null}
    </FeedLightboxContext.Provider>
  );
}
