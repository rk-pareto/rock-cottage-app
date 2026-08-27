import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Railway Bucket (S3-compatible, private). Credentials are server-only and
 * never reach the browser — only presigned URLs do (spec §20).
 *
 * Variable names follow what Railway injects; a couple of common aliases are
 * accepted so a renamed variable doesn't silently break uploads.
 */
function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export const BUCKET_NAME = env("BUCKET_NAME", "AWS_BUCKET_NAME", "S3_BUCKET_NAME");
const ENDPOINT = env("AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL", "S3_ENDPOINT");
const REGION = env("AWS_REGION", "S3_REGION") ?? "auto";
const ACCESS_KEY = env("AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID");
const SECRET_KEY = env("AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY");

export function isStorageConfigured(): boolean {
  return Boolean(BUCKET_NAME && ENDPOINT && ACCESS_KEY && SECRET_KEY);
}

let client: S3Client | undefined;

function s3(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error("Object storage is not configured (missing bucket/endpoint/credentials)");
  }
  client ??= new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    // Railway buckets report urlStyle "virtual-host"; set S3_FORCE_PATH_STYLE
    // if a future bucket is path-style instead.
    forcePathStyle: env("S3_FORCE_PATH_STYLE") === "true",
    credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
  });
  return client;
}

/** Short-lived URLs only — no permanent public bucket URLs (spec §14.7). */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 12 * 60;

export function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

export function presignDownload(key: string, downloadFilename?: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: downloadFilename
        ? `attachment; filename="${downloadFilename.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

/** Inline (no attachment header) — used for in-app viewing of derivatives. */
export function presignView(key: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      // The bucket sets no cache headers of its own; without this the browser
      // guesses, and the lightbox re-downloads photos it showed seconds ago.
      ResponseCacheControl: "private, max-age=600",
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const response = await s3().send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Object ${key} had no body`);
  return Buffer.from(bytes);
}

export async function putObjectBytes(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const present = keys.filter(Boolean);
  if (present.length === 0) return;
  await s3().send(
    new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: { Objects: present.map((Key) => ({ Key })) },
    }),
  );
}

/**
 * Keys are always built server-side from the memory UUID (spec §14.4) — the
 * client never chooses where its bytes land. Sanitisation only affects the
 * key; the stored bytes and the recorded original filename are untouched.
 *
 * New objects land under `memories/`; anything uploaded before the rename
 * still lives under `photos/` and is found by the key stored on its row.
 */
export function originalKey(memoryId: string, filename: string): string {
  const safe =
    filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .slice(-120) || "upload";
  return `memories/${memoryId}/original/${safe}`;
}

export const displayKey = (memoryId: string) => `memories/${memoryId}/display.webp`;
export const thumbnailKey = (memoryId: string) => `memories/${memoryId}/thumbnail.webp`;
/** The frame the browser grabbed from a video, exactly as it was sent. */
export const posterKey = (memoryId: string) => `memories/${memoryId}/poster.jpg`;
/** The transcoded copy a video is played back and shared from. Deterministic,
 *  so re-running a transcode simply overwrites the previous attempt. */
export const playbackKey = (memoryId: string) => `memories/${memoryId}/playback.mp4`;

/**
 * Stream an object down to a local file. ffmpeg needs seekable input for an
 * MP4/MOV, and a clip is far too big to hold in the container's memory just to
 * get it onto disk (spec §14 memory discipline).
 */
export async function getObjectToFile(key: string, destination: string): Promise<void> {
  const response = await s3().send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const body = response.Body as Readable | undefined;
  if (!body) throw new Error(`Object ${key} had no body`);
  await pipeline(body, createWriteStream(destination));
}

/** Upload straight from disk, for the same reason. */
export async function putObjectFromFile(
  key: string,
  filePath: string,
  contentType: string,
): Promise<number> {
  const { size } = await stat(filePath);
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: createReadStream(filePath),
      // A stream body carries no length of its own, and the bucket won't take
      // it chunked.
      ContentLength: size,
      ContentType: contentType,
    }),
  );
  return size;
}

/**
 * Stream an object straight through instead of buffering it. Videos are far
 * too big to hold in the container's memory just to hand them to a client.
 */
export async function getObjectStream(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array>; contentType?: string; contentLength?: number }> {
  const response = await s3().send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const body = response.Body?.transformToWebStream();
  if (!body) throw new Error(`Object ${key} had no body`);
  return {
    body: body as ReadableStream<Uint8Array>,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}
