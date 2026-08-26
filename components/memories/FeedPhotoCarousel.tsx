"use client";

import { PlayGlyph } from "@/components/ui/icons";
import { useFeedLightbox } from "./FeedLightbox";

export type FeedCarouselMemory = {
  id: string;
  kind: "image" | "video";
  uploadedBy: string;
  thumbnailUrl: string | null;
  durationLabel: string | null;
};

/**
 * A strip of recent memories dropped into the home feed as one card, not
 * scattered as many — 5 to 10 photos, swipeable like a story rail. Every
 * thumbnail shares the same crop so the row stays level regardless of the
 * source photo's own aspect ratio; tapping one opens the same fullscreen
 * viewer the gallery uses (see {@link FeedLightboxProvider}), scrolled to
 * that photo.
 */
export function FeedPhotoCarousel({
  memories,
}: {
  memories: FeedCarouselMemory[];
}) {
  const open = useFeedLightbox();

  return (
    <div className="flex flex-col gap-2.5">
      <p className="label text-muted">From the week</p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {memories.map((memory) => (
          <button
            key={memory.id}
            type="button"
            onClick={() => open(memory.id)}
            className="group relative aspect-[4/5] w-[38%] shrink-0 snap-start overflow-hidden rounded-2xl bg-subtle sm:w-[26%]"
          >
            {memory.thumbnailUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={memory.thumbnailUrl}
                alt={`Added by ${memory.uploadedBy}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-active:scale-[1.02]"
              />
            ) : null}
            {memory.kind === "video" ? (
              <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-ink/70 px-1.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
                <PlayGlyph className="h-2.5 w-2.5" />
                {memory.durationLabel ?? "Video"}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
