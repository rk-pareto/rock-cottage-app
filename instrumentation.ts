/**
 * Runs once when the server starts, before it accepts requests.
 *
 * Railway runs one long-lived Node process, so this is where the background
 * passes over the media table get started. Deliberately not awaited — this is
 * background work and must not hold up the server coming online.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // The video playback queue: anything left `pending` or `processing` by the
  // previous process (or by the migration that backfilled existing clips) is
  // queued up again.
  const { sweepPendingTranscodes } = await import("@/lib/storage/transcode");
  void sweepPendingTranscodes()
    .then((count) => {
      if (count > 0) console.log(`transcode sweep: queued ${count} video(s)`);
    })
    .catch((error) => console.error("transcode sweep failed", error));

  // Uploads the browser abandoned: finish the ones whose bytes made it to the
  // bucket, fail the ones that never arrived. Keeps sweeping while the process
  // is up, because that is when they are stranded.
  const { startStallSweeps } = await import("@/lib/storage/derivatives");
  startStallSweeps();
}
