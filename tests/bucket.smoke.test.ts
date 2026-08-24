import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  deleteObjects,
  getObjectBytes,
  isStorageConfigured,
  presignDownload,
  presignUpload,
  putObjectBytes,
} from "@/lib/storage/s3";
import { processImage } from "@/lib/storage/process";

/**
 * Exercises the real Railway bucket, so it is opt-in:
 *   RUN_BUCKET_SMOKE=1 npx vitest run tests/bucket.smoke.test.ts
 * It writes only under `memories/_smoketest-*` and deletes what it creates.
 */
const enabled = process.env.RUN_BUCKET_SMOKE === "1" && isStorageConfigured();

describe.skipIf(!enabled)("Railway bucket round-trip", () => {
  it("uploads, reads back, derives, downloads, and stays private", async () => {
    const prefix = `memories/_smoketest-${Date.now()}`;
    const originalKey = `${prefix}/original/iphone-sample.heic`;
    const displayKey = `${prefix}/display.webp`;
    const heic = await readFile("tests/fixtures/iphone-sample.heic");

    try {
      // A phone PUTs the original straight to the bucket.
      const putUrl = await presignUpload(originalKey, "image/heic");
      const put = await fetch(putUrl, {
        method: "PUT",
        body: new Uint8Array(heic),
        headers: { "content-type": "image/heic" },
      });
      expect(put.ok, `PUT failed: ${put.status}`).toBe(true);

      // The server reads it back byte-for-byte — the original is sacred.
      const readBack = await getObjectBytes(originalKey);
      expect(readBack.equals(heic)).toBe(true);

      const processed = await processImage(readBack);
      expect(processed.width).toBe(1280);
      await putObjectBytes(displayKey, processed.display.buffer, "image/webp");

      const getUrl = await presignDownload(originalKey, "iphone-sample.heic");
      const get = await fetch(getUrl);
      expect(get.status).toBe(200);
      expect(get.headers.get("content-disposition")).toContain("iphone-sample.heic");
      expect(Buffer.from(await get.arrayBuffer()).equals(heic)).toBe(true);

      // The same URL without its signature must not work.
      const anon = await fetch(getUrl.split("?")[0]!);
      expect(anon.status, "bucket is publicly readable!").not.toBe(200);
    } finally {
      await deleteObjects([originalKey, displayKey]).catch(() => {});
    }
  }, 120_000);
});
