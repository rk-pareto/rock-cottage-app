"use client";

import { useState } from "react";
import { FeedComposer } from "./FeedComposer";
import { FeedPostCard, type FeedPostData } from "./FeedPostCard";

/**
 * The top-of-feed strip: the composer, then every post nobody's dismissed
 * yet. Lives in a client component only so a dismiss or delete can drop a
 * card immediately, rather than waiting on the next server round trip.
 */
export function FeedPostsSection({
  posts,
  currentMemberId,
  isAdmin,
  storageReady,
}: {
  posts: FeedPostData[];
  currentMemberId: string;
  isAdmin: boolean;
  storageReady: boolean;
}) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const visible = posts.filter((p) => !removedIds.has(p.id));

  return (
    <section className="flex flex-col gap-3">
      <FeedComposer storageReady={storageReady} />
      {visible.map((post) => (
        <FeedPostCard
          key={post.id}
          post={post}
          canDeleteForEveryone={post.authorMemberId === currentMemberId || isAdmin}
          onRemoved={(id) => setRemovedIds((current) => new Set(current).add(id))}
        />
      ))}
    </section>
  );
}
