import "../db/load-env";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { DISPLAY_MAX_EDGE, processImage } from "@/lib/storage/process";
import {
  displayKey,
  getObjectBytes,
  isStorageConfigured,
  objectSize,
  putObjectBytes,
  thumbnailKey,
} from "@/lib/storage/s3";

/**
 * Rebuild every memory's display and thumbnail copies from the original that
 * has been kept all along (spec §14.2).
 *
 * Run it after changing how derivatives are made — `DISPLAY_MAX_EDGE` and
 * friends in `lib/storage/process.ts` — since those settings only ever applied
 * at upload time, so photos already in the bucket keep whatever they were
 * given on the day:
 *
 *   railway run npm run media:reprocess -- --dry-run   # report, write nothing
 *   railway run npm run media:reprocess
 *
 * Safe to re-run and safe to interrupt: each memory is independent, derivative
 * keys are deterministic, and the originals are only ever read. One that fails
 * is reported and skipped — its old derivatives stay exactly as they were, so
 * nothing disappears from the gallery.
 *
 * Viewers can see the old copy for a few minutes afterwards: derivative URLs
 * are signed per five-minute block and cached by the browser for ten (see
 * `presignView`), and this writes over the same key.
 */

/** Sharp already serialises the decoding; this is about the network. */
const CONCURRENCY = 3;

type Outcome = { id: string; before: number; after: number } | { id: string; error: string };

function size(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * The image a memory's tile is made from: the photo itself, or for a video the
 * still frame the browser grabbed when it was uploaded. A clip with no poster
 * has nothing to redraw and is skipped.
 */
function sourceKeyFor(row: typeof media.$inferSelect): string | null {
  return row.kind === "video" ? row.posterKey : row.originalKey;
}

async function reprocess(row: typeof media.$inferSelect, dryRun: boolean): Promise<Outcome> {
  const source = sourceKeyFor(row);
  if (!source) return { id: row.id, error: "no source object to derive from" };

  // Write back over whatever keys the row already points at. Some early
  // uploads live under `photos/` rather than `memories/`; regenerating those
  // under the current naming would strand the objects the row still names.
  const dKey = row.displayKey ?? displayKey(row.id);
  const tKey = row.thumbnailKey ?? thumbnailKey(row.id);

  const [original, previousDisplay, previousThumbnail] = await Promise.all([
    getObjectBytes(source),
    objectSize(dKey),
    objectSize(tKey),
  ]);
  const before = (previousDisplay ?? 0) + (previousThumbnail ?? 0);

  const processed = await processImage(original);
  const after = processed.display.buffer.byteLength + processed.thumbnail.buffer.byteLength;

  if (dryRun) return { id: row.id, before, after };

  await Promise.all([
    putObjectBytes(dKey, processed.display.buffer, processed.display.contentType),
    putObjectBytes(tKey, processed.thumbnail.buffer, processed.thumbnail.contentType),
  ]);

  // A row that had no derivatives — an upload whose processing failed at the
  // time — now has them, so it becomes visible in the gallery.
  await db
    .update(media)
    .set({
      displayKey: dKey,
      thumbnailKey: tKey,
      processingStatus: "ready",
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(media.id, row.id));

  return { id: row.id, before, after };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!isStorageConfigured()) {
    console.error(
      "Bucket credentials are missing. Run this through `railway run` (or with a .env.local that has them).",
    );
    process.exit(1);
  }

  // Oldest first, so a run that is interrupted has worked through the photos
  // least likely to still be in anyone's browser cache.
  const rows = await db
    .select()
    .from(media)
    .where(inArray(media.processingStatus, ["ready", "failed"]))
    .orderBy(asc(media.createdAt));

  console.log(
    `${dryRun ? "Would reprocess" : "Reprocessing"} ${rows.length} memories at ${DISPLAY_MAX_EDGE}px…`,
  );

  const outcomes: Outcome[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        const outcome = await reprocess(row, dryRun).catch((error: unknown) => ({
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        }));
        outcomes.push(outcome);
        const done = outcomes.length;
        if ("error" in outcome) {
          console.warn(`  [${done}/${rows.length}] ${row.id} skipped — ${outcome.error}`);
        } else {
          console.log(
            `  [${done}/${rows.length}] ${row.originalFilename}: ${size(outcome.before)} → ${size(outcome.after)}`,
          );
        }
      }
    }),
  );

  const done = outcomes.filter((o): o is Extract<Outcome, { before: number }> => !("error" in o));
  const before = done.reduce((sum, o) => sum + o.before, 0);
  const after = done.reduce((sum, o) => sum + o.after, 0);
  const failed = outcomes.length - done.length;

  console.log(
    `\n${done.length} rebuilt${failed > 0 ? `, ${failed} skipped` : ""}: ${size(before)} → ${size(after)}` +
      (before > 0 ? ` (${Math.round((1 - after / before) * 100)}% smaller)` : ""),
  );
  if (dryRun) console.log("Dry run — nothing was written.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Reprocessing failed:", error);
    process.exit(1);
  });
