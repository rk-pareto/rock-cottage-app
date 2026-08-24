import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { processImage, toShareableJpeg } from "@/lib/storage/process";

/**
 * The formats phones actually produce. HEIC matters most — it is the iPhone
 * default and the one most likely to be missing from a stock image build
 * (spec §14.6).
 */
async function makeImage(format: "jpeg" | "png" | "webp", width = 3200, height = 2400) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 80 } },
  })
    [format]()
    .toBuffer();
}

describe("image processing", () => {
  it("decodes a real HEIC file and produces both derivatives", async () => {
    const heic = await readFile("tests/fixtures/iphone-sample.heic");
    expect((await sharp(heic).metadata()).format).toBe("heif");

    const result = await processImage(heic);

    expect(result.display.contentType).toBe("image/webp");
    expect(result.thumbnail.contentType).toBe("image/webp");
    expect((await sharp(result.display.buffer).metadata()).format).toBe("webp");
    expect((await sharp(result.thumbnail.buffer).metadata()).format).toBe("webp");
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
  });

  it.each(["jpeg", "png", "webp"] as const)("handles %s uploads", async (format) => {
    const original = await makeImage(format);
    const result = await processImage(original);

    const display = await sharp(result.display.buffer).metadata();
    const thumb = await sharp(result.thumbnail.buffer).metadata();

    // Longest edge is clamped, aspect ratio preserved.
    expect(Math.max(display.width!, display.height!)).toBe(2560);
    expect(Math.max(thumb.width!, thumb.height!)).toBe(640);
    expect(display.width! / display.height!).toBeCloseTo(3200 / 2400, 2);
  });

  it("never enlarges an image smaller than the targets", async () => {
    const small = await makeImage("jpeg", 400, 300);
    const result = await processImage(small);

    const display = await sharp(result.display.buffer).metadata();
    const thumb = await sharp(result.thumbnail.buffer).metadata();
    expect(display.width).toBe(400);
    expect(thumb.width).toBe(400);
  });

  it("leaves the original buffer untouched", async () => {
    const original = await makeImage("jpeg");
    const before = Buffer.from(original);
    await processImage(original);
    expect(original.equals(before)).toBe(true);
  });

  it("auto-orients from EXIF so rotated phone shots aren't sideways", async () => {
    // orientation 6 = rotate 90°, so a 1200x600 source becomes 600x1200.
    const rotated = await sharp({
      create: { width: 1200, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const result = await processImage(rotated);
    const display = await sharp(result.display.buffer).metadata();
    expect(display.width).toBe(600);
    expect(display.height).toBe(1200);
    expect(result.width).toBe(600);
    expect(result.height).toBe(1200);
  });

  it("rejects a file that isn't an image at all", async () => {
    await expect(processImage(Buffer.from("this is not an image"))).rejects.toThrow();
  });
});

describe("share encoding", () => {
  it("turns the WebP display copy into JPEG at the same size", async () => {
    const { display } = await processImage(await makeImage("jpeg", 3200, 2400));
    const shared = await toShareableJpeg(display.buffer);

    // WhatsApp would treat WebP as a sticker; JPEG is what every target takes.
    const metadata = await sharp(shared).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(2560);
    expect(metadata.height).toBe(1920);
  });
});
