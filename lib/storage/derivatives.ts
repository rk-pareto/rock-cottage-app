import "server-only";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { processImage } from "./process";
import {
  displayKey,
  getObjectBytes,
  isStorageConfigured,
  objectSize,
  putObjectBytes,
  thumbnailKey,
  UPLOAD_URL_TTL_SECONDS,
} from "./s3";

export type MediaItem = typeof media.$inferSelect;

/**
 * Recorded on a row whose bytes never reached the bucket at all, so the grid
 * can say "Upload didn't finish" instead of "No preview". The two failures
 * look identical in the database and could not be more different to the
 * person looking at the tile: one has an original safely in the bucket and
 * only lacks a preview, the other has nothing, and the only fix is to send
 * the photo again.
 */
export const UPLOAD_NEVER_LANDED = "The upload didn't finish — no bytes reached the bucket.";

/**
 * Build a memory's display and thumbnail copies and mark the row `ready`.
 *
 * A photo is derived from the upload itself. A video's tile is derived from
 * the poster frame the browser captured and PUT alongside it, so nothing here
 * has to open the clip.
 *
 * Original preservation outranks derivative generation — a processing failure
 * marks the row "failed" and leaves the original object completely alone
 * (spec §14.6). A video whose poster never arrived is still "ready": the clip
 * plays fine, it just shows a placeholder tile in the grid.
 *
 * Shared by `/complete` and the stall sweep, so a memory rescued eight minutes
 * late finishes exactly the way one finished on the response path does.
 */
export async function buildDerivatives(item: MediaItem): Promise<"ready" | "failed"> {
  const isVideo = item.kind === "video";
  const sourceKey = isVideo ? item.posterKey : item.originalKey;

  // Nothing to derive from: the clip itself is already safely in the bucket.
  if (isVideo && !sourceKey) {
    await markReady(item.id);
    return "ready";
  }

  await db
    .update(media)
    .set({ processingStatus: "processing", processingError: null, updatedAt: new Date() })
    .where(eq(media.id, item.id));

  try {
    const source = await getObjectBytes(sourceKey!);
    const processed = await processImage(source);

    const dKey = displayKey(item.id);
    const tKey = thumbnailKey(item.id);
    await Promise.all([
      putObjectBytes(dKey, processed.display.buffer, processed.display.contentType),
      putObjectBytes(tKey, processed.thumbnail.buffer, processed.thumbnail.contentType),
    ]);

    await db
      .update(media)
      .set({
        displayKey: dKey,
        thumbnailKey: tKey,
        // A clip's dimensions came from the browser at intent time and are
        // authoritative — the poster is only a frame of it.
        originalWidth: isVideo ? (item.originalWidth ?? processed.width) : processed.width,
        originalHeight: isVideo ? (item.originalHeight ?? processed.height) : processed.height,
        processingStatus: "ready",
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(media.id, item.id));

    return "ready";
  } catch (error) {
    console.error("memory processing failed", item.id, error);

    // The clip is intact and playable; only its poster failed to render.
    if (isVideo) {
      await markReady(item.id);
      return "ready";
    }

    await markFailed(
      item.id,
      error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    );
    return "failed";
  }
}

/**
 * Every memory that has been sitting unfinished longer than its presigned
 * upload URL can possibly still be usable for.
 *
 * The whole of this pipeline's failure mode is client-side: the browser gets
 * its presigned PUT, the row is written `pending`, and then a phone that lost
 * signal mid-upload simply never calls `/complete`. The server hears nothing
 * about it and the row sits in everyone's grid forever, indistinguishable from
 * work in progress. Nothing else reconciles these — `sweepPendingTranscodes`
 * covers video playback only, and `reprocess-derivatives` deliberately touches
 * `ready`/`failed` rows alone.
 *
 * The cutoff is what makes this safe to run against a live app: a memory is
 * only considered once its upload URL has expired, so an upload still crawling
 * up a phone's radio is never mistaken for wreckage.
 */
export function findStalledMedia(now = new Date()): Promise<MediaItem[]> {
  return db
    .select()
    .from(media)
    .where(
      and(
        inArray(media.processingStatus, ["pending", "processing"]),
        lt(media.updatedAt, new Date(now.getTime() - UPLOAD_URL_TTL_SECONDS * 1000)),
      ),
    )
    .orderBy(asc(media.createdAt));
}

/**
 * Resolve every stranded memory, one way or the other: finish the ones whose
 * bytes are actually in the bucket (the PUT landed but `/complete` never ran —
 * the tab was closed, or the phone locked, between the two), and mark the rest
 * failed so the grid can stop pretending they are still arriving.
 *
 * Returns how many rows it moved. Never throws: one unreadable row must not
 * stop the sweep, and nothing waits on this.
 */
export async function sweepStalledMedia(): Promise<number> {
  if (!isStorageConfigured()) return 0;

  const rows = await findStalledMedia();
  let resolved = 0;

  for (const row of rows) {
    try {
      if (await bytesLanded(row)) {
        await buildDerivatives(row);
      } else {
        await markFailed(row.id, UPLOAD_NEVER_LANDED);
      }
      resolved++;
    } catch (error) {
      console.error("stall sweep failed", row.id, error);
    }
  }

  return resolved;
}

/**
 * Run the sweep now and keep running it, so a memory stranded while the server
 * is up resolves on its own within the hour rather than waiting for the next
 * deploy. The interval is unref'd — this must never be the reason a container
 * refuses to shut down.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let sweeping = false;

export function startStallSweeps(): void {
  const run = () => {
    if (sweeping) return; // a slow sweep must not stack on itself
    sweeping = true;
    void sweepStalledMedia()
      .then((count) => {
        if (count > 0) console.log(`stall sweep: resolved ${count} stranded upload(s)`);
      })
      .catch((error) => console.error("stall sweep failed", error))
      .finally(() => {
        sweeping = false;
      });
  };

  run();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}

/**
 * Whether the upload itself is really in the bucket. A zero-byte object counts
 * as absent: a PUT that died after the headers went out leaves exactly that,
 * and there is nothing in it to derive from.
 *
 * Always the original, never a derivative — for a video that is the clip, the
 * one object whose absence means the memory is genuinely empty. A missing
 * poster costs it only its tile.
 */
async function bytesLanded(item: MediaItem): Promise<boolean> {
  if (!item.originalKey) return false;
  return Boolean(await objectSize(item.originalKey));
}

function markReady(id: string) {
  return db
    .update(media)
    .set({ processingStatus: "ready", processingError: null, updatedAt: new Date() })
    .where(eq(media.id, id));
}

function markFailed(id: string, error: string) {
  return db
    .update(media)
    .set({ processingStatus: "failed", processingError: error, updatedAt: new Date() })
    .where(eq(media.id, id));
}
