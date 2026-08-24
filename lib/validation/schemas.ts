import { z } from "zod";
import { PET_EVENT_TYPES } from "@/db/schema";

export const uuidSchema = z.string().uuid();

/** Trimmed, non-empty, bounded. Used for every user-entered name. */
export const itemNameSchema = z
  .string()
  .trim()
  .min(1, "Give it a name")
  .max(200, "That name is too long");

export const petSlugSchema = z.string().trim().min(1).max(40);
export const petEventTypeSchema = z.enum(PET_EVENT_TYPES);

export const optionalTextSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

export const categorySchema = z
  .string()
  .trim()
  .max(80)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

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

export const MAX_PHOTO_BYTES = 60 * 1024 * 1024; // 60 MB — generous for a RAW-ish HEIC

export const uploadIntentSchema = z.object({
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().trim().toLowerCase().pipe(z.enum(IMAGE_CONTENT_TYPES)),
  bytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
});
