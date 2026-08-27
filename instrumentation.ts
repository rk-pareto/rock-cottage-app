/**
 * Runs once when the server starts, before it accepts requests.
 *
 * Railway runs one long-lived Node process, so this is where the video
 * playback queue gets refilled: anything left `pending` or `processing` by the
 * previous process (or by the migration that backfilled existing clips) is
 * queued up again. Deliberately not awaited — the sweep is background work and
 * must not hold up the server coming online.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sweepPendingTranscodes } = await import("@/lib/storage/transcode");
  void sweepPendingTranscodes()
    .then((count) => {
      if (count > 0) console.log(`transcode sweep: queued ${count} video(s)`);
    })
    .catch((error) => console.error("transcode sweep failed", error));
}
