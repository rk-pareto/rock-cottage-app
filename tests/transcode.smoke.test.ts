import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { probeVideo, transcodeToMp4 } from "@/lib/storage/ffmpeg";

/**
 * Runs the real ffmpeg, so it is opt-in like the bucket smoke test:
 *   RUN_TRANSCODE_SMOKE=1 npx vitest run tests/transcode.smoke.test.ts
 * Fixtures are synthesised into a temp dir and deleted afterwards; nothing
 * touches the bucket or the database.
 */
const enabled = process.env.RUN_TRANSCODE_SMOKE === "1";
const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";

/** A short clip in a codec the pipeline is meant to replace. */
async function makeClip(
  path: string,
  options: { size: string; codec: string; extra?: string[] },
): Promise<void> {
  await run(FFMPEG, [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${options.size}:rate=30:duration=2`,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    options.codec,
    ...(options.extra ?? []),
    "-c:a",
    "aac",
    "-shortest",
    path,
  ]);
}

/** faststart means the moov atom sits ahead of the media data. */
async function moovComesFirst(path: string): Promise<boolean> {
  const head = await readFile(path);
  const moov = head.indexOf("moov", 0, "latin1");
  const mdat = head.indexOf("mdat", 0, "latin1");
  return moov !== -1 && mdat !== -1 && moov < mdat;
}

describe.skipIf(!enabled)("video transcoding end to end", () => {
  it("turns an oversized non-H.264 clip into a capped 1080p faststart MP4", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rc-transcode-test-"));
    try {
      const input = join(dir, "input.mp4");
      const output = join(dir, "playback.mp4");
      await makeClip(input, { size: "2560x1440", codec: "mpeg4", extra: ["-q:v", "5"] });

      const outcome = await transcodeToMp4(input, output);
      expect(outcome.skipped).toBe(false);
      if (outcome.skipped) return;
      expect(outcome.bytes).toBeGreaterThan(0);

      const result = await probeVideo(output);
      expect(result.videoCodec).toBe("h264");
      expect(result.audioCodec).toBe("aac");
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(Math.round(result.durationSeconds ?? 0)).toBe(2);
      expect(await moovComesFirst(output)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it("leaves a clip that already plays everywhere alone", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rc-transcode-test-"));
    try {
      const input = join(dir, "input.mp4");
      const output = join(dir, "playback.mp4");
      await makeClip(input, {
        size: "640x360",
        codec: "libx264",
        extra: ["-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p"],
      });

      const outcome = await transcodeToMp4(input, output);
      expect(outcome.skipped).toBe(true);
      expect(outcome.summary.videoCodec).toBe("h264");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it("refuses a file with no video in it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rc-transcode-test-"));
    try {
      const input = join(dir, "audio-only.m4a");
      await run(FFMPEG, [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-c:a", "aac", input,
      ]);
      await expect(probeVideo(input)).rejects.toThrow(/no video stream/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
