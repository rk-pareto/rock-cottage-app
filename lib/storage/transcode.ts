import "server-only";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { media, type ProcessingState } from "@/db/schema";
import { MAX_VIDEO_BYTES } from "@/lib/validation/schemas";
import { transcodeToMp4 } from "./ffmpeg";
import { getObjectToFile, isStorageConfigured, playbackKey, putObjectFromFile } from "./s3";

/**
 * The playback-copy pipeline: give every video a capped-1080p H.264/AAC MP4
 * so a clip recorded as HEVC plays for the whole family, not just the phone
 * that shot it.
 *
 * Strictly one encode at a time — an encode is the most expensive thing this
 * container does, and stacking them would starve request serving. The queue
 * lives only in memory; after a restart the boot sweep is the source of truth,
 * so a job is never lost, only re-run (which is safe: the key is deterministic
 * and the upload overwrites).
 *
 * Everything here is reachable through `enqueueTranscode` and
 * `sweepPendingTranscodes` alone, so if encodes ever need to move to their own
 * Railway worker service, no call site changes.
 */

const pending = new Set<string>();
const order: string[] = [];
let draining = false;

/** Queue a video's playback pass. Returns immediately — nothing waits on the
 *  encode, least of all an HTTP response. Already-queued ids are ignored. */
export function enqueueTranscode(memoryId: string): void {
  if (pending.has(memoryId)) return;
  pending.add(memoryId);
  order.push(memoryId);
  drain();
}

function drain(): void {
  if (draining) return;
  draining = true;
  void (async () => {
    try {
      while (order.length > 0) {
        const id = order.shift()!;
        try {
          await runJob(id);
        } catch (error) {
          // runJob records its own failures; this only catches the truly
          // unexpected so one bad clip can't stop the queue.
          console.error("transcode job crashed", id, error);
        } finally {
          pending.delete(id);
        }
      }
    } finally {
      // Cleared in the same tick the loop exits, so an id enqueued a moment
      // later always finds the queue idle and restarts it.
      draining = false;
    }
  })();
}

async function setPlayback(
  memoryId: string,
  values: {
    playbackStatus: ProcessingState;
    playbackKey?: string | null;
    playbackBytes?: number | null;
    playbackError?: string | null;
  },
): Promise<void> {
  await db.update(media).set({ ...values, updatedAt: new Date() }).where(eq(media.id, memoryId));
}

async function runJob(memoryId: string): Promise<void> {
  const [item] = await db.select().from(media).where(eq(media.id, memoryId)).limit(1);
  if (!item || item.kind !== "video") return;
  // Someone else already finished this one, or it failed and is waiting for a
  // manual retry (spec §8: failed stays failed).
  if (item.playbackStatus === "ready" || item.playbackStatus === "failed") return;

  // The upload ceiling is enforced at intent time; anything past it is a row
  // we shouldn't spend twenty minutes on.
  if (item.originalBytes > MAX_VIDEO_BYTES) {
    await setPlayback(memoryId, {
      playbackStatus: "failed",
      playbackError: "Original is larger than the upload limit",
    });
    return;
  }

  await setPlayback(memoryId, { playbackStatus: "processing", playbackError: null });

  const workDir = await mkdtemp(join(tmpdir(), "rc-transcode-"));
  try {
    const input = join(workDir, "original");
    const output = join(workDir, "playback.mp4");

    await getObjectToFile(item.originalKey, input);
    const outcome = await transcodeToMp4(input, output);

    if (outcome.skipped) {
      // Already an ordinary 1080p H.264 MP4 — the original *is* the playback
      // copy, so record its size and store no second object.
      await setPlayback(memoryId, {
        playbackStatus: "ready",
        playbackKey: null,
        playbackBytes: item.originalBytes,
        playbackError: null,
      });
      console.log("transcode skipped (original already plays everywhere)", memoryId);
      return;
    }

    const key = playbackKey(memoryId);
    await putObjectFromFile(key, output, "video/mp4");
    await setPlayback(memoryId, {
      playbackStatus: "ready",
      playbackKey: key,
      playbackBytes: outcome.bytes,
      playbackError: null,
    });
    console.log(
      `transcode ready ${memoryId}: ${item.originalBytes} → ${outcome.bytes} bytes`,
    );
  } catch (error) {
    console.error("transcode failed", memoryId, error);
    // The original is untouched and still plays wherever it can — this pass
    // being invisible in the UI is the point (spec §8).
    await setPlayback(memoryId, {
      playbackStatus: "failed",
      playbackError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    }).catch((dbError) => console.error("transcode: couldn't record failure", memoryId, dbError));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch((error) =>
      console.error("transcode: temp cleanup failed", workDir, error),
    );
  }
}

/**
 * Every video whose playback pass hasn't finished, oldest first: the backfill
 * for clips that predate this pipeline, and crash recovery for a job a deploy
 * or restart interrupted mid-`processing`.
 *
 * A large backlog just takes a while — still one encode at a time.
 */
export async function sweepPendingTranscodes(): Promise<number> {
  if (!isStorageConfigured()) return 0;

  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(
      and(eq(media.kind, "video"), inArray(media.playbackStatus, ["pending", "processing"])),
    )
    .orderBy(asc(media.createdAt));

  for (const row of rows) enqueueTranscode(row.id);
  return rows.length;
}
