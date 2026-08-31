import { z } from "zod";
import { BRINGING_CATEGORIES, PET_EVENT_TYPES } from "@/db/schema";

export const uuidSchema = z.string().uuid();

/** Trimmed, non-empty, bounded. Used for every user-entered name. */
export const itemNameSchema = z
  .string()
  .trim()
  .min(1, "Give it a name")
  .max(200, "That name is too long");

/**
 * A meal title typed by the person cooking it. Same 200-char column as an item
 * name, but the prompt it answers is different, so the message is too.
 */
export const mealTitleSchema = z
  .string()
  .trim()
  .min(1, "Say what you're making")
  .max(200, "That's a long name for a meal");

export const petSlugSchema = z.string().trim().min(1).max(40);
export const petEventTypeSchema = z.enum(PET_EVENT_TYPES);

export const optionalTextSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

export const categorySchema = z.enum(BRINGING_CATEGORIES);

/** An ISO instant that is a real date and not absurdly far from now. */
export const occurredAtSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Not a valid time"))
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), "Not a valid time")
  .refine(
    (d) => Math.abs(Date.now() - d.getTime()) < 1000 * 60 * 60 * 24 * 365,
    "That time is too far from now",
  );

/** Images we accept for upload. HEIC/HEIF matters — iPhones default to it. */
export const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
] as const;

/**
 * Videos we accept. `video/quicktime` is what an iPhone hands over for a .mov
 * and is the common case here; the clip is stored and played back exactly as
 * recorded, so playback depends on the viewing browser's own codec support.
 */
export const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
] as const;

export const MAX_PHOTO_BYTES = 60 * 1024 * 1024; // 60 MB — generous for a RAW-ish HEIC
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024; // 512 MB — a couple of minutes of 4K

/**
 * The OS share sheet needs the whole file in memory as a `File`, which a phone
 * will not do for a large clip. Past this, Download is the honest option.
 */
export const MAX_SHAREABLE_VIDEO_BYTES = 64 * 1024 * 1024;

export type UploadKind = "image" | "video";

export function kindForContentType(contentType: string): UploadKind | null {
  const normalized = contentType.trim().toLowerCase();
  if ((IMAGE_CONTENT_TYPES as readonly string[]).includes(normalized)) return "image";
  if ((VIDEO_CONTENT_TYPES as readonly string[]).includes(normalized)) return "video";
  return null;
}

export function maxBytesFor(kind: UploadKind): number {
  return kind === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
}

/**
 * What a shopping-list photo upload has to declare. Images only — there is no
 * player on that screen, and nothing here keeps an original, so a clip would
 * have nowhere to go. No filename either: the upload lands on one fixed
 * scratch key derived from the item.
 */
export const shoppingPhotoIntentSchema = z.object({
  contentType: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => kindForContentType(v) === "image", "That has to be a photo."),
  bytes: z
    .number()
    .int()
    .positive()
    .max(MAX_PHOTO_BYTES, `That photo is larger than ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))} MB.`),
});

/** Whole positive pixels, ignored rather than rejected when a browser lies. */
const dimensionSchema = z.number().int().positive().max(100_000).optional();

export const uploadIntentSchema = z
  .object({
    filename: z.string().trim().min(1).max(300),
    contentType: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => kindForContentType(v) !== null, "That file type isn't supported."),
    bytes: z.number().int().positive(),
    // Videos carry what the browser already knows about the clip, so the
    // server never has to open it: the still is what gets processed.
    width: dimensionSchema,
    height: dimensionSchema,
    durationSeconds: z.number().nonnegative().max(24 * 60 * 60).optional(),
    /** Whether a poster frame will follow, so the intent can presign for it. */
    hasPoster: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const kind = kindForContentType(value.contentType);
    if (!kind) return; // already reported by the contentType refinement
    const max = maxBytesFor(kind);
    if (value.bytes > max) {
      ctx.addIssue({
        code: "custom",
        path: ["bytes"],
        message: `That ${kind === "video" ? "video" : "photo"} is larger than ${Math.round(max / (1024 * 1024))} MB.`,
      });
    }
  })
  .transform((value) => ({ ...value, kind: kindForContentType(value.contentType)! }));
