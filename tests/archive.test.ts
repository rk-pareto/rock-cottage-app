import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  archiveFilename,
  crc32,
  entryNames,
  pickDownloadVariant,
  zipStream,
} from "@/lib/storage/archive";

const run = promisify(execFile);

/** An entry whose bytes arrive in several chunks, as an S3 stream's would. */
function chunked(contents: Buffer, chunkSize = 7): () => Promise<ReadableStream<Uint8Array>> {
  return async () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < contents.length; at += chunkSize) {
          controller.enqueue(new Uint8Array(contents.subarray(at, at + chunkSize)));
        }
        controller.close();
      },
    });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/** Write the archive out and let a real unzip pass judgement on it. */
async function unzipInto(archive: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cottage-zip-"));
  const file = path.join(dir, "archive.zip");
  await writeFile(file, archive);
  // Fails the test rather than the assertion if the CRCs or offsets are wrong.
  await run("unzip", ["-t", file]);
  await run("unzip", ["-q", file, "-d", dir]);
  return dir;
}

describe("crc32", () => {
  it("matches the known IEEE checksum for 'The quick brown fox…'", () => {
    const input = new TextEncoder().encode("The quick brown fox jumps over the lazy dog");
    expect(crc32(input)).toBe(0x414fa339);
  });

  it("is the same whether the bytes arrive in one chunk or several", () => {
    const bytes = new TextEncoder().encode("rock cottage memories, packed one chunk at a time");
    const whole = crc32(bytes);
    let running = 0;
    for (let at = 0; at < bytes.length; at += 5) running = crc32(bytes.subarray(at, at + 5), running);
    expect(running).toBe(whole);
  });
});

describe("zipStream", () => {
  it("produces an archive real unzip accepts, with the bytes intact", async () => {
    const lake = Buffer.from("a photo of the lake, more or less\n".repeat(40));
    const dock = Buffer.from([...Array(5000).keys()].map((n) => n % 256));

    const archive = await collect(
      zipStream([
        { name: "lake.jpg", date: new Date("2026-07-04T10:30:00Z"), open: chunked(lake) },
        { name: "dock.mp4", date: new Date("2026-07-05T18:00:00Z"), open: chunked(dock, 512) },
      ]),
    );

    const dir = await unzipInto(archive);
    expect(await readFile(path.join(dir, "lake.jpg"))).toEqual(lake);
    expect(await readFile(path.join(dir, "dock.mp4"))).toEqual(dock);
  });

  it("leaves out an entry whose object can't be opened, and keeps the rest", async () => {
    const kept = Buffer.from("this one is fine");
    const archive = await collect(
      zipStream([
        { name: "gone.jpg", open: async () => Promise.reject(new Error("no such key")) },
        { name: "kept.jpg", open: chunked(kept) },
      ]),
    );

    const dir = await unzipInto(archive);
    expect(await readFile(path.join(dir, "kept.jpg"))).toEqual(kept);
    const { stdout } = await run("zipinfo", ["-1", path.join(dir, "archive.zip")]);
    expect(stdout.trim().split("\n")).toEqual(["kept.jpg"]);
  });

  it("writes an empty but valid archive when nothing could be opened", async () => {
    const archive = await collect(zipStream([]));
    // End-of-central-directory only: signature, zeroed counts, no comment.
    expect(archive).toHaveLength(22);
    expect(archive.readUInt32LE(0)).toBe(0x06054b50);
  });

  it("stops pulling from the bucket when the download is cancelled", async () => {
    let cancelled = false;
    const stream = zipStream([
      {
        name: "big.mp4",
        open: async () =>
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(1024));
            },
            cancel() {
              cancelled = true;
            },
          }),
      },
    ]);

    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    // The generator's `finally` runs on the next microtasks.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cancelled).toBe(true);
  });
});

describe("entryNames", () => {
  it("keeps distinct names as they are", () => {
    expect(entryNames(["IMG_1.jpg", "IMG_2.jpg"])).toEqual(["IMG_1.jpg", "IMG_2.jpg"]);
  });

  it("numbers collisions instead of letting one overwrite the other", () => {
    expect(entryNames(["IMG_1.jpg", "img_1.JPG", "IMG_1.jpg"])).toEqual([
      "IMG_1.jpg",
      "img_1 (2).JPG",
      "IMG_1 (3).jpg",
    ]);
  });

  it("does not collide with a name that already looks like a copy", () => {
    expect(entryNames(["a.jpg", "a (2).jpg", "a.jpg"])).toEqual(["a.jpg", "a (2).jpg", "a (3).jpg"]);
  });

  it("flattens anything that would scatter the archive into folders", () => {
    expect(entryNames(["../../etc/passwd", "DCIM\\100APPLE\\IMG.JPG"])).toEqual([
      ".._.._etc_passwd",
      "DCIM_100APPLE_IMG.JPG",
    ]);
  });

  it("always yields a usable name", () => {
    expect(entryNames(["   "])).toEqual(["memory"]);
  });
});

describe("pickDownloadVariant", () => {
  const photo = {
    kind: "image" as const,
    originalKey: "memories/1/original/IMG_1.HEIC",
    originalFilename: "IMG_1.HEIC",
    displayKey: "memories/1/display.webp",
    playbackKey: null,
  };
  const clip = {
    kind: "video" as const,
    originalKey: "memories/2/original/IMG_2.MOV",
    originalFilename: "IMG_2.MOV",
    displayKey: "memories/2/display.webp",
    playbackKey: "memories/2/playback.mp4",
  };

  it("hands back the untouched upload for originals", () => {
    expect(pickDownloadVariant(photo, "original")).toEqual({
      key: photo.originalKey,
      name: "IMG_1.HEIC",
    });
    expect(pickDownloadVariant(clip, "original")).toEqual({
      key: clip.originalKey,
      name: "IMG_2.MOV",
    });
  });

  it("hands back the app's own derivative for compressed", () => {
    expect(pickDownloadVariant(photo, "compressed")).toEqual({
      key: "memories/1/display.webp",
      name: "IMG_1.webp",
    });
    expect(pickDownloadVariant(clip, "compressed")).toEqual({
      key: "memories/2/playback.mp4",
      name: "IMG_2.mp4",
    });
  });

  it("falls back to the original rather than dropping a memory from the batch", () => {
    // A clip that needed no transcode, and a photo whose derivatives failed.
    expect(pickDownloadVariant({ ...clip, playbackKey: null }, "compressed").key).toBe(
      clip.originalKey,
    );
    expect(pickDownloadVariant({ ...photo, displayKey: null }, "compressed").key).toBe(
      photo.originalKey,
    );
  });
});

describe("archiveFilename", () => {
  it("is dated and unmistakably ours", () => {
    expect(archiveFilename()).toMatch(/^rock-cottage-memories-\d{4}-\d{2}-\d{2}\.zip$/);
  });
});
