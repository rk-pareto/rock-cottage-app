/**
 * What a video's playback copy should look like, decided from an ffprobe
 * report.
 *
 * Deliberately pure — no binary, no filesystem, no database — so the scaling,
 * rotation and audio calls can be tested against fabricated probe output.
 * `lib/storage/ffmpeg.ts` runs the binaries; this file only decides.
 */

/** Cap the longest edge here: phone 4K becomes 1080p, nothing is upscaled. */
export const PLAYBACK_MAX_EDGE = 1920;
/** …and the short edge, so an ultra-wide clip can't sneak past the cap. */
export const PLAYBACK_MAX_SHORT_EDGE = 1080;
/** Above this average bitrate an already-H.264 clip still earns its re-encode. */
export const SKIP_MAX_BITRATE = 8_000_000;
/** An AAC track at or under this is copied through rather than re-encoded. */
export const AUDIO_COPY_MAX_BITRATE = 160_000;
const AUDIO_TARGET_BITRATE = "128k";

/** The slices of `ffprobe -show_format -show_streams -print_format json` we
 *  actually read. Everything is optional — ffprobe omits what it can't tell. */
export type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  bit_rate?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};

export type ProbeReport = {
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    size?: string;
    tags?: { major_brand?: string };
  };
  streams?: ProbeStream[];
};

export type VideoSummary = {
  /** `format_name` split up, e.g. `["mov", "mp4", "m4a", "3gp", "3g2", "mj2"]`. */
  container: string[];
  /** The `ftyp` brand, the only thing separating a real .mp4 from a .mov. */
  majorBrand: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioBitrate: number | null;
  hasAudio: boolean;
  /** Dimensions as *displayed*, i.e. with the rotation ffmpeg auto-applies
   *  already taken into account. Null when ffprobe didn't report them. */
  width: number | null;
  height: number | null;
  rotation: number;
  /** Average bits per second across the whole file. */
  bitrate: number | null;
  durationSeconds: number | null;
};

function toNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rotation lives in one of two places depending on how the clip was written:
 * the legacy `rotate` tag, or a display-matrix side-data entry (what modern
 * iPhones produce). Normalised to 0/90/180/270.
 */
function rotationOf(stream: ProbeStream): number {
  const fromSideData = stream.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation;
  const raw = fromSideData ?? toNumber(stream.tags?.rotate) ?? 0;
  const normalized = ((Math.round(raw) % 360) + 360) % 360;
  // Anything off-axis isn't a phone orientation; treat it as unrotated.
  return normalized % 90 === 0 ? normalized : 0;
}

export function summarizeProbe(report: ProbeReport): VideoSummary {
  const streams = report.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  const rotation = video ? rotationOf(video) : 0;
  const coded = { width: video?.width ?? null, height: video?.height ?? null };
  // A quarter-turn swaps what the viewer sees, and it is the displayed frame
  // the scale filter operates on.
  const swapped = rotation === 90 || rotation === 270;

  return {
    container: (report.format?.format_name ?? "").split(",").filter(Boolean),
    majorBrand: report.format?.tags?.major_brand?.trim() || null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    audioBitrate: audio ? toNumber(audio.bit_rate) : null,
    hasAudio: Boolean(audio),
    width: swapped ? coded.height : coded.width,
    height: swapped ? coded.width : coded.height,
    rotation,
    bitrate: toNumber(report.format?.bit_rate),
    durationSeconds: toNumber(report.format?.duration),
  };
}

/**
 * True when re-encoding would buy nothing: the original is already an MP4 of
 * H.264 (plus AAC, if it has sound) inside the size and bitrate we'd aim for.
 * Such a clip is marked ready with no playback object, meaning "serve the
 * original, it's already fine".
 *
 * A QuickTime-branded file is never skipped even when its streams qualify —
 * `.mov` playback is the exact thing this pipeline exists to fix.
 */
export function shouldSkipTranscode(summary: VideoSummary): boolean {
  if (summary.videoCodec !== "h264") return false;
  if (!summary.container.includes("mp4")) return false;
  if (summary.majorBrand?.startsWith("qt")) return false;
  if (summary.hasAudio && summary.audioCodec !== "aac") return false;
  if (summary.width === null || summary.height === null) return false;

  const longest = Math.max(summary.width, summary.height);
  const shortest = Math.min(summary.width, summary.height);
  if (longest > PLAYBACK_MAX_EDGE || shortest > PLAYBACK_MAX_SHORT_EDGE) return false;

  // An unknown bitrate is treated as too big: better to spend one encode than
  // to keep serving something we can't vouch for.
  return summary.bitrate !== null && summary.bitrate <= SKIP_MAX_BITRATE;
}

/** H.264 in yuv420p needs even dimensions; odd ones fail the encode outright. */
function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Fit inside the cap while preserving aspect ratio, never upscaling, and
 * always landing on even numbers.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge = PLAYBACK_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return { width: toEven(width * scale), height: toEven(height * scale) };
}

/**
 * With dimensions in hand the filter is just two numbers. Without them (a
 * probe that reported no width/height) fall back to letting ffmpeg fit the
 * frame into the cap itself.
 */
function scaleFilter(summary: VideoSummary): string {
  if (summary.width === null || summary.height === null) {
    return (
      `scale=w='min(${PLAYBACK_MAX_EDGE},iw)':h='min(${PLAYBACK_MAX_EDGE},ih)'` +
      `:force_original_aspect_ratio=decrease:force_divisible_by=2`
    );
  }
  const target = targetDimensions(summary.width, summary.height);
  return `scale=${target.width}:${target.height}`;
}

function canCopyAudio(summary: VideoSummary): boolean {
  if (summary.audioCodec !== "aac") return false;
  // An AAC track with no reported bitrate is cheap enough to re-encode rather
  // than gamble on.
  return summary.audioBitrate !== null && summary.audioBitrate <= AUDIO_COPY_MAX_BITRATE;
}

/**
 * The full ffmpeg command line for the playback copy.
 *
 * Note there is no `-noautorotate`: ffmpeg applies the clip's rotation for us
 * and drops the metadata, which is why {@link summarizeProbe} reports display
 * dimensions — the scale filter sees the already-rotated frame.
 */
export function buildTranscodeArgs(
  summary: VideoSummary,
  paths: { input: string; output: string },
): string[] {
  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    paths.input,
    // First video stream only — a phone clip has no second one, and a stray
    // cover-art stream would otherwise be treated as video.
    "-map",
    "0:v:0",
  ];

  if (summary.hasAudio) args.push("-map", "0:a:0");

  args.push(
    "-vf",
    scaleFilter(summary),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
  );

  if (!summary.hasAudio) args.push("-an");
  else if (canCopyAudio(summary)) args.push("-c:a", "copy");
  else args.push("-c:a", "aac", "-b:a", AUDIO_TARGET_BITRATE);

  // moov atom up front, so playback starts before the download finishes.
  args.push("-movflags", "+faststart", paths.output);
  return args;
}
