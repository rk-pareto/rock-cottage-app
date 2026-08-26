"use client";

import { PlayGlyph } from "@/components/ui/icons";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { relativeTime } from "@/lib/time";
import { useFeedLightbox } from "./FeedLightbox";

export type FeedPhotoMemory = {
  id: string;
  kind: "image" | "video";
  uploadedBy: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationLabel: string | null;
  /** ISO — a plain Date can't cross into a client component as a prop. */
  createdAt: string;
};

/**
 * A memory dropped between meals on the home feed. Deliberately shaped
 * unlike a meal card: the picture is from earlier in the week and has
 * nothing to do with the meal above it. Tapping it opens the fullscreen
 * viewer in place (see {@link FeedLightboxProvider}) so a glance at "the
 * week" doesn't cost the scroll position on home; a clip is still marked
 * as a clip rather than pretending to play here.
 */
export function FeedPhotoTile({ memory }: { memory: FeedPhotoMemory }) {
  const open = useFeedLightbox();
  const portrait =
    memory.width && memory.height ? memory.height > memory.width : false;

  return (
    <button
      type="button"
      onClick={() => open(memory.id)}
      className="group block w-full overflow-hidden rounded-2xl text-left"
    >
      <div
        className={`relative w-full overflow-hidden rounded-2xl bg-subtle ${portrait ? "aspect-[4/5]" : "aspect-[4/3]"}`}
      >
        {memory.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={memory.thumbnailUrl}
            alt={`Added by ${memory.uploadedBy}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : null}
        {memory.kind === "video" ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-ink/70 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            <PlayGlyph className="h-3 w-3" />
            {memory.durationLabel ?? "Video"}
          </span>
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-2 text-xs">
        <span className="label text-muted">From the week</span>
        <span className="text-muted">
          {memory.uploadedBy}
          {" · "}
          <RelativeTime iso={memory.createdAt} initial={relativeTime(memory.createdAt)} />
        </span>
      </p>
    </button>
  );
}
