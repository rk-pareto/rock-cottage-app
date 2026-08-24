import "server-only";
import sharp, { type Sharp } from "sharp";

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
const SHARE_QUALITY = 88;

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

/** Resize + encode both variants from a fresh pipeline per output. */
async function renderVariants(
  makePipeline: () => Sharp,
  knownSize?: { width: number; height: number },
): Promise<ProcessedImage> {
  let width = knownSize?.width ?? null;
  let height = knownSize?.height ?? null;

  if (!knownSize) {
    const metadata = await makePipeline().metadata();
    // After auto-orientation width/height may swap.
    const oriented = metadata.autoOrient ?? { width: metadata.width, height: metadata.height };
    width = oriented.width ?? metadata.width ?? null;
    height = oriented.height ?? metadata.height ?? null;
  }

  const [display, thumbnail] = await Promise.all([
    makePipeline()
      .resize({
        width: DISPLAY_MAX_EDGE,
        height: DISPLAY_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: DISPLAY_QUALITY })
      .toBuffer(),
    makePipeline()
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
}

/** Cheap container sniff: ISO-BMFF `ftyp` box with a HEIF-family brand. */
function looksLikeHeif(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString("latin1", 4, 8) !== "ftyp") return false;
  const brand = buffer.toString("latin1", 8, 12);
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(
    brand,
  );
}

/**
 * sharp's prebuilt libvips reads the HEIF *container* but has no HEVC codec,
 * so `metadata()` succeeds while decoding fails with "bad seek". iPhones
 * default to HEIC, so decode those through libheif (WASM) and hand sharp raw
 * pixels instead (spec §14.6).
 */
async function decodeHeif(
  original: Buffer,
): Promise<{ data: Buffer; width: number; height: number } | null> {
  if (!looksLikeHeif(original)) return null;
  try {
    const { default: decode } = await import("heic-decode");
    const { width, height, data } = await decode({ buffer: original });
    return { data: Buffer.from(data.buffer, data.byteOffset, data.byteLength), width, height };
  } catch (error) {
    console.error("HEIC fallback decode failed", error);
    return null;
  }
}

/**
 * Build the display and thumbnail variants. The original buffer is only ever
 * read — it is never written back (spec §14.2).
 */
export function processImage(original: Buffer): Promise<ProcessedImage> {
  return withConcurrencyLimit(async () => {
    try {
      // `failOn: "none"` keeps slightly malformed phone images usable rather
      // than failing the whole upload.
      return await renderVariants(() => sharp(original, { failOn: "none" }).rotate());
    } catch (error) {
      const raw = await decodeHeif(original);
      if (!raw) throw error;

      // libheif already applies the image's rotation, and raw pixels carry no
      // EXIF, so no .rotate() here.
      return renderVariants(
        () =>
          sharp(raw.data, {
            raw: { width: raw.width, height: raw.height, channels: 4 },
          }),
        { width: raw.width, height: raw.height },
      );
    }
  });
}

/**
 * Re-encode a stored derivative as JPEG for the share sheet.
 *
 * The display copy is WebP, which WhatsApp treats as a sticker and older
 * SMS/MMS clients refuse outright, so the bytes handed to `navigator.share()`
 * are always JPEG.
 */
export function toShareableJpeg(image: Buffer): Promise<Buffer> {
  return withConcurrencyLimit(() =>
    sharp(image, { failOn: "none" }).jpeg({ quality: SHARE_QUALITY }).toBuffer(),
  );
}
