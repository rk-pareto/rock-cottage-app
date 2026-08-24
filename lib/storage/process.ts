import "server-only";
import sharp from "sharp";

export type Derivative = { buffer: Buffer; contentType: string };
export type ProcessedImage = {
  display: Derivative;
  thumbnail: Derivative;
  width: number | null;
  height: number | null;
};

const DISPLAY_MAX_EDGE = 2560;
const DISPLAY_QUALITY = 85;
const THUMBNAIL_MAX_EDGE = 640;
const THUMBNAIL_QUALITY = 78;

/**
 * Full-resolution decodes are memory-hungry and a phone can fire several
 * uploads at once. Serialise them so a burst can't exhaust the Railway
 * container (spec §14.5).
 */
const MAX_CONCURRENT = 2;
let active = 0;
const queue: (() => void)[] = [];

async function withConcurrencyLimit<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await task();
  } finally {
    active--;
    queue.shift()?.();
  }
}

/**
 * Build the display and thumbnail variants. The original buffer is only ever
 * read — it is never written back (spec §14.2).
 */
export function processImage(original: Buffer): Promise<ProcessedImage> {
  return withConcurrencyLimit(async () => {
    // `failOn: "none"` keeps slightly malformed phone images usable rather
    // than failing the whole upload.
    const base = () => sharp(original, { failOn: "none" }).rotate();

    const metadata = await base().metadata();
    // After auto-orientation, width/height may swap.
    const rotated = metadata.autoOrient ?? { width: metadata.width, height: metadata.height };
    const width = rotated.width ?? metadata.width ?? null;
    const height = rotated.height ?? metadata.height ?? null;

    const [display, thumbnail] = await Promise.all([
      base()
        .resize({
          width: DISPLAY_MAX_EDGE,
          height: DISPLAY_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: DISPLAY_QUALITY })
        .toBuffer(),
      base()
        .resize({
          width: THUMBNAIL_MAX_EDGE,
          height: THUMBNAIL_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: THUMBNAIL_QUALITY })
        .toBuffer(),
    ]);

    return {
      display: { buffer: display, contentType: "image/webp" },
      thumbnail: { buffer: thumbnail, contentType: "image/webp" },
      width,
      height,
    };
  });
}
