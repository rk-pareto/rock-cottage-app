import { describe, expect, it } from "vitest";
import {
  buildTranscodeArgs,
  shouldSkipTranscode,
  summarizeProbe,
  targetDimensions,
  type ProbeReport,
} from "@/lib/storage/videoProfile";

/**
 * The transcode decisions, against fabricated ffprobe output. No binary runs
 * here — see tests/transcode.smoke.test.ts for the end-to-end pass.
 */

/** A probe report shaped like the real thing, with the bits under test set. */
function report(overrides: {
  videoCodec?: string;
  audioCodec?: string | null;
  audioBitrate?: string;
  width?: number;
  height?: number;
  rotate?: string;
  displayMatrixRotation?: number;
  bitrate?: string;
  formatName?: string;
  majorBrand?: string;
} = {}): ProbeReport {
  const {
    videoCodec = "hevc",
    audioCodec = "aac",
    audioBitrate = "128000",
    width = 3840,
    height = 2160,
    rotate,
    displayMatrixRotation,
    bitrate = "50000000",
    formatName = "mov,mp4,m4a,3gp,3g2,mj2",
    majorBrand = "isom",
  } = overrides;

  return {
    format: {
      format_name: formatName,
      duration: "12.5",
      bit_rate: bitrate,
      tags: { major_brand: majorBrand },
    },
    streams: [
      {
        codec_type: "video",
        codec_name: videoCodec,
        width,
        height,
        ...(rotate ? { tags: { rotate } } : {}),
        ...(displayMatrixRotation !== undefined
          ? { side_data_list: [{ rotation: displayMatrixRotation }] }
          : {}),
      },
      ...(audioCodec
        ? [{ codec_type: "audio", codec_name: audioCodec, bit_rate: audioBitrate }]
        : []),
    ],
  };
}

describe("summarizeProbe", () => {
  it("reads codecs, container and bitrate", () => {
    const summary = summarizeProbe(report());
    expect(summary.videoCodec).toBe("hevc");
    expect(summary.audioCodec).toBe("aac");
    expect(summary.audioBitrate).toBe(128_000);
    expect(summary.hasAudio).toBe(true);
    expect(summary.container).toContain("mp4");
    expect(summary.majorBrand).toBe("isom");
    expect(summary.bitrate).toBe(50_000_000);
    expect(summary.durationSeconds).toBe(12.5);
  });

  it("reports display dimensions for a quarter-turned clip", () => {
    // What a portrait iPhone clip looks like: landscape frame, rotated.
    const fromSideData = summarizeProbe(report({ displayMatrixRotation: -90 }));
    expect(fromSideData.rotation).toBe(270);
    expect(fromSideData.width).toBe(2160);
    expect(fromSideData.height).toBe(3840);

    const fromTag = summarizeProbe(report({ rotate: "90" }));
    expect(fromTag.rotation).toBe(90);
    expect(fromTag.width).toBe(2160);
    expect(fromTag.height).toBe(3840);
  });

  it("leaves dimensions alone for a half-turn or no turn", () => {
    expect(summarizeProbe(report({ rotate: "180" })).width).toBe(3840);
    expect(summarizeProbe(report()).rotation).toBe(0);
  });

  it("notices a silent clip", () => {
    const summary = summarizeProbe(report({ audioCodec: null }));
    expect(summary.hasAudio).toBe(false);
    expect(summary.audioCodec).toBeNull();
  });

  it("survives a probe that reports almost nothing", () => {
    const summary = summarizeProbe({});
    expect(summary.videoCodec).toBeNull();
    expect(summary.width).toBeNull();
    expect(summary.bitrate).toBeNull();
    expect(summary.hasAudio).toBe(false);
  });
});

describe("shouldSkipTranscode", () => {
  const alreadyFine = {
    videoCodec: "h264",
    width: 1920,
    height: 1080,
    bitrate: "6000000",
  };

  it("skips an ordinary 1080p H.264/AAC MP4", () => {
    expect(shouldSkipTranscode(summarizeProbe(report(alreadyFine)))).toBe(true);
  });

  it("skips a silent one too", () => {
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, audioCodec: null }))),
    ).toBe(true);
  });

  it("transcodes HEVC — the whole reason this exists", () => {
    expect(shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, videoCodec: "hevc" })))).toBe(
      false,
    );
  });

  it("transcodes a QuickTime-branded file even when its streams qualify", () => {
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, majorBrand: "qt  " }))),
    ).toBe(false);
  });

  it("transcodes anything bigger than 1080p", () => {
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, width: 3840, height: 2160 }))),
    ).toBe(false);
    // Portrait 1080p is fine; portrait 4K is not.
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, width: 1080, height: 1920 }))),
    ).toBe(true);
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, width: 1440, height: 1920 }))),
    ).toBe(false);
  });

  it("transcodes a high-bitrate clip even at 1080p", () => {
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, bitrate: "20000000" }))),
    ).toBe(false);
  });

  it("transcodes when audio wouldn't play, or when the probe is vague", () => {
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, audioCodec: "pcm_s16le" }))),
    ).toBe(false);
    expect(shouldSkipTranscode(summarizeProbe({}))).toBe(false);
  });

  it("transcodes a container that isn't MP4", () => {
    expect(
      shouldSkipTranscode(summarizeProbe(report({ ...alreadyFine, formatName: "matroska,webm" }))),
    ).toBe(false);
  });
});

describe("targetDimensions", () => {
  it("caps the longest edge and keeps the aspect ratio", () => {
    expect(targetDimensions(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(targetDimensions(2160, 3840)).toEqual({ width: 1080, height: 1920 });
  });

  it("never upscales", () => {
    expect(targetDimensions(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("always lands on even numbers", () => {
    const { width, height } = targetDimensions(1281, 721);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);

    const scaled = targetDimensions(3000, 1687);
    expect(scaled.width % 2).toBe(0);
    expect(scaled.height % 2).toBe(0);
    expect(scaled.width).toBe(1920);
  });
});

describe("buildTranscodeArgs", () => {
  const paths = { input: "/tmp/in.mov", output: "/tmp/out.mp4" };
  const argsFor = (overrides?: Parameters<typeof report>[0]) =>
    buildTranscodeArgs(summarizeProbe(report(overrides)), paths);

  it("produces a faststart H.264 MP4 in yuv420p", () => {
    const args = argsFor();
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args.join(" ")).toContain("-movflags +faststart");
    expect(args.at(-1)).toBe(paths.output);
    expect(args[args.indexOf("-i") + 1]).toBe(paths.input);
  });

  it("scales 4K down to 1080p", () => {
    expect(argsFor()).toContain("scale=1920:1080");
  });

  it("scales a portrait clip on its displayed dimensions", () => {
    expect(argsFor({ displayMatrixRotation: -90 })).toContain("scale=1080:1920");
  });

  it("doesn't upscale a small clip, but still forces even dimensions", () => {
    expect(argsFor({ width: 640, height: 481 })).toContain("scale=640:482");
  });

  it("lets ffmpeg fit the frame when the probe gave no dimensions", () => {
    const args = buildTranscodeArgs(summarizeProbe({ streams: [{ codec_type: "video" }] }), paths);
    const filter = args[args.indexOf("-vf") + 1]!;
    expect(filter).toContain("force_original_aspect_ratio=decrease");
    expect(filter).toContain("force_divisible_by=2");
  });

  it("copies an AAC track through rather than re-encoding it", () => {
    const args = argsFor({ audioCodec: "aac", audioBitrate: "128000" });
    expect(args.join(" ")).toContain("-c:a copy");
  });

  it("re-encodes audio that is anything else, or too fat to copy", () => {
    expect(argsFor({ audioCodec: "pcm_s16le" }).join(" ")).toContain("-c:a aac -b:a 128k");
    expect(argsFor({ audioCodec: "aac", audioBitrate: "320000" }).join(" ")).toContain(
      "-c:a aac -b:a 128k",
    );
  });

  it("drops audio handling entirely for a silent clip", () => {
    const args = argsFor({ audioCodec: null });
    expect(args).toContain("-an");
    expect(args).not.toContain("0:a:0");
  });
});
