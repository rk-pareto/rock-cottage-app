import "server-only";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import ffmpegStatic from "ffmpeg-static";
import { path as ffprobeStatic } from "ffprobe-static";
import {
  buildTranscodeArgs,
  shouldSkipTranscode,
  summarizeProbe,
  type ProbeReport,
  type VideoSummary,
} from "./videoProfile";

/**
 * The two binaries, run on local files. Nothing here knows about the bucket or
 * the database — that glue lives in `transcode.ts`, which is also what makes
 * this pair testable on a fixture clip alone.
 *
 * Binaries come from the `ffmpeg-static` / `ffprobe-static` packages so no
 * Dockerfile or Nixpacks change is needed; the env overrides exist for a
 * machine that would rather use its own build.
 */
const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic || "ffprobe";

/** A poison clip must not be able to wedge the queue (spec §7). */
export const ENCODE_TIMEOUT_MS = 20 * 60 * 1000;
const PROBE_TIMEOUT_MS = 60 * 1000;
/** Enough of stderr to diagnose a failure, not enough to bloat a log line. */
const STDERR_LIMIT = 4000;

class CommandError extends Error {
  constructor(command: string, detail: string) {
    super(`${command} failed: ${detail}`);
    this.name = "CommandError";
  }
}

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_LIMIT);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CommandError(bin, error.message));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new CommandError(bin, `timed out after ${Math.round(timeoutMs / 1000)}s`));
        return;
      }
      if (code !== 0) {
        reject(new CommandError(bin, `exit ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/** What ffprobe says about a local clip, reduced to the decisions we make. */
export async function probeVideo(inputPath: string): Promise<VideoSummary> {
  const stdout = await run(
    FFPROBE,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ],
    PROBE_TIMEOUT_MS,
  );

  let report: ProbeReport;
  try {
    report = JSON.parse(stdout) as ProbeReport;
  } catch {
    throw new CommandError(FFPROBE, "returned output that wasn't JSON");
  }
  if (!report.streams?.some((s) => s.codec_type === "video")) {
    throw new CommandError(FFPROBE, "found no video stream");
  }
  return summarizeProbe(report);
}

export type TranscodeOutcome =
  | { skipped: true; summary: VideoSummary }
  | { skipped: false; summary: VideoSummary; bytes: number };

/**
 * Build the playback copy at `outputPath`, or report that the original is
 * already good enough and no copy is needed. The input file is only read.
 */
export async function transcodeToMp4(
  inputPath: string,
  outputPath: string,
): Promise<TranscodeOutcome> {
  const summary = await probeVideo(inputPath);
  if (shouldSkipTranscode(summary)) return { skipped: true, summary };

  await run(FFMPEG, buildTranscodeArgs(summary, { input: inputPath, output: outputPath }), ENCODE_TIMEOUT_MS);

  const { size } = await stat(outputPath);
  if (size === 0) throw new CommandError(FFMPEG, "produced an empty file");
  return { skipped: false, summary, bytes: size };
}
