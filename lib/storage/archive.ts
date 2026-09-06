import "server-only";
import type { MediaKind } from "@/db/schema";
import { cottageToday } from "@/lib/time";

/**
 * A streaming ZIP writer, for handing back a whole selection of memories at
 * once.
 *
 * Nothing here may hold a file in memory: a selection can easily be several
 * gigabytes of clips, and the container has to keep serving requests while it
 * packs them. So each entry's bytes are piped straight from the bucket to the
 * client and the checksum is computed on the way past — which is exactly what
 * ZIP's *data descriptor* is for, writing the CRC and the size after the data
 * rather than before it.
 *
 * Entries are **stored, never deflated**. Everything in this bucket is already
 * a compressed format (HEIC, JPEG, WebP, MP4); running deflate over it would
 * spend the container's CPU to make the archive very slightly bigger.
 */

const LOCAL_SIG = 0x04034b50;
const DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;

/** Bit 3: the sizes follow the data. Bit 11: the name is UTF-8. */
const FLAGS = 0x0008 | 0x0800;
const STORED = 0;
/** 2.0 — the floor for a stored entry carrying a data descriptor. */
const VERSION = 20;
/** 4.5 — needed to read the Zip64 records, which are only written if used. */
const VERSION_ZIP64 = 45;

const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

/** CRC-32 (IEEE 802.3), the checksum every ZIP entry carries. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** Fold one more chunk into a running CRC; start from 0. */
export function crc32(chunk: Uint8Array, running = 0): number {
  let c = ~running >>> 0;
  for (let i = 0; i < chunk.length; i++) c = (CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return ~c >>> 0;
}

/** Little-endian scratch buffer — every field in a ZIP record is LE. */
function record(size: number) {
  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer);
  let at = 0;
  return {
    u16(value: number) {
      view.setUint16(at, value, true);
      at += 2;
    },
    u32(value: number) {
      view.setUint32(at, value >>> 0, true);
      at += 4;
    },
    u64(value: number) {
      view.setBigUint64(at, BigInt(value), true);
      at += 8;
    },
    raw(value: Uint8Array) {
      buffer.set(value, at);
      at += value.length;
    },
    done: () => buffer,
  };
}

type Stamp = { time: number; date: number };

/** The 1980-epoch MS-DOS clock ZIP still records its timestamps in. */
function dosStamp(when: Date): Stamp {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

function localHeader(name: Uint8Array, stamp: Stamp): Uint8Array {
  const w = record(30 + name.length);
  w.u32(LOCAL_SIG);
  w.u16(VERSION);
  w.u16(FLAGS);
  w.u16(STORED);
  w.u16(stamp.time);
  w.u16(stamp.date);
  // CRC and both sizes are unknown until the object has finished streaming;
  // they are written again, for real, in the descriptor below.
  w.u32(0);
  w.u32(0);
  w.u32(0);
  w.u16(name.length);
  w.u16(0);
  w.raw(name);
  return w.done();
}

function dataDescriptor(crc: number, size: number): Uint8Array {
  const w = record(16);
  w.u32(DESCRIPTOR_SIG);
  w.u32(crc);
  w.u32(size); // compressed
  w.u32(size); // uncompressed — the same, because entries are stored
  return w.done();
}

type Placed = { name: Uint8Array; stamp: Stamp; crc: number; size: number; offset: number };

function centralHeader(entry: Placed): Uint8Array {
  // Individual entries never need Zip64 — a single upload is capped well under
  // 4 GB — but a big enough selection pushes later entries past a 32-bit
  // offset, and only that field has to move into the extra block.
  const needsZip64 = entry.offset > U32_MAX;
  let extra = new Uint8Array(0);
  if (needsZip64) {
    const e = record(12);
    e.u16(0x0001);
    e.u16(8);
    e.u64(entry.offset);
    extra = e.done();
  }

  const w = record(46 + entry.name.length + extra.length);
  w.u32(CENTRAL_SIG);
  w.u16(needsZip64 ? VERSION_ZIP64 : VERSION); // version made by
  w.u16(needsZip64 ? VERSION_ZIP64 : VERSION); // version needed to extract
  w.u16(FLAGS);
  w.u16(STORED);
  w.u16(entry.stamp.time);
  w.u16(entry.stamp.date);
  w.u32(entry.crc);
  w.u32(entry.size);
  w.u32(entry.size);
  w.u16(entry.name.length);
  w.u16(extra.length);
  w.u16(0); // comment length
  w.u16(0); // disk number
  w.u16(0); // internal attributes
  w.u32(0); // external attributes
  w.u32(needsZip64 ? U32_MAX : entry.offset);
  w.raw(entry.name);
  w.raw(extra);
  return w.done();
}

function endRecords(count: number, centralSize: number, centralOffset: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  const needsZip64 = count > U16_MAX || centralSize > U32_MAX || centralOffset > U32_MAX;

  if (needsZip64) {
    const z = record(56);
    z.u32(ZIP64_EOCD_SIG);
    z.u64(44); // bytes of this record after this field
    z.u16(VERSION_ZIP64);
    z.u16(VERSION_ZIP64);
    z.u32(0); // this disk
    z.u32(0); // disk holding the central directory
    z.u64(count);
    z.u64(count);
    z.u64(centralSize);
    z.u64(centralOffset);
    parts.push(z.done());

    const l = record(20);
    l.u32(ZIP64_LOCATOR_SIG);
    l.u32(0);
    l.u64(centralOffset + centralSize);
    l.u32(1);
    parts.push(l.done());
  }

  // Always written, Zip64 or not: it is what a reader looks for from the end.
  // Overflowing fields carry the all-ones sentinel that points at the record
  // above.
  const e = record(22);
  e.u32(EOCD_SIG);
  e.u16(0);
  e.u16(0);
  e.u16(Math.min(count, U16_MAX));
  e.u16(Math.min(count, U16_MAX));
  e.u32(Math.min(centralSize, U32_MAX));
  e.u32(Math.min(centralOffset, U32_MAX));
  e.u16(0); // no archive comment
  parts.push(e.done());
  return parts;
}

export type ZipEntry = {
  /** The name this file gets inside the archive. */
  name: string;
  /** Stamped onto the entry, so an unzipped folder keeps the day each memory
   *  was added rather than the day it was downloaded. */
  date?: Date;
  /** Opened only when the writer reaches this entry — one object is ever in
   *  flight, which is what keeps a 40-clip archive off the heap. */
  open: () => Promise<ReadableStream<Uint8Array>>;
};

/** Pack `entries` into a ZIP that streams as it is built. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const parts = zipParts(entries);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await parts.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      // The tab was closed or the download cancelled — stop pulling from S3.
      void parts.return(undefined);
    },
  });
}

async function* zipParts(entries: ZipEntry[]): AsyncGenerator<Uint8Array, void, unknown> {
  const encoder = new TextEncoder();
  const central: Placed[] = [];
  let offset = 0;

  for (const entry of entries) {
    let body: ReadableStream<Uint8Array>;
    try {
      body = await entry.open();
    } catch (error) {
      // Nothing has been written for this entry yet, so it can still be left
      // out entirely. One unreadable object must not cost someone the other
      // thirty-nine photos.
      console.error("zip: skipping unreadable entry", entry.name, error);
      continue;
    }

    const name = encoder.encode(entry.name);
    const stamp = dosStamp(entry.date ?? new Date());
    const start = offset;

    let crc = 0;
    let size = 0;
    // Claimed before the header is written, so every path out of here —
    // including the consumer walking away between the header and the first
    // chunk — closes the object stream on the way past.
    const reader = body.getReader();
    try {
      const header = localHeader(name, stamp);
      offset += header.length;
      yield header;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        crc = crc32(value, crc);
        size += value.byteLength;
        offset += value.byteLength;
        yield value;
      }
    } finally {
      // A no-op once the stream drained; the point is the abandoned case,
      // where the download was cancelled mid-entry.
      await reader.cancel().catch(() => {});
    }

    // Unreachable while uploads are capped below 4 GB (`MAX_VIDEO_BYTES`), and
    // the alternative to noticing is a silently corrupt archive.
    if (size > U32_MAX) throw new Error(`zip: ${entry.name} is too large to store`);

    const descriptor = dataDescriptor(crc, size);
    offset += descriptor.length;
    yield descriptor;

    central.push({ name, stamp, crc, size, offset: start });
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const entry of central) {
    const header = centralHeader(entry);
    centralSize += header.length;
    yield header;
  }
  for (const part of endRecords(central.length, centralSize, centralOffset)) yield part;
}

/**
 * Names for a batch of entries: made safe for a ZIP, then made unique.
 *
 * Two phones both hand over `IMG_0042.JPG`, and an archive where the second
 * one silently replaced the first is far worse than an ugly name — so
 * collisions get a counter. Matched case-insensitively, because macOS and
 * Windows both treat those two as the same file.
 */
export function entryNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    // A separator here would scatter the archive into directories named after
    // whatever the phone put in the filename.
    const safe = raw.replace(/[\\/]/g, "_").replace(/[\x00-\x1f]/g, "").trim() || "memory";
    const dot = safe.lastIndexOf(".");
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const extension = dot > 0 ? safe.slice(dot) : "";

    let candidate = safe;
    let copy = 1;
    while (used.has(candidate.toLowerCase())) {
      copy += 1;
      candidate = `${stem} (${copy})${extension}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** What the browser saves the archive as. */
export function archiveFilename(): string {
  return `rock-cottage-memories-${cottageToday()}.zip`;
}

export type DownloadVariant = "original" | "compressed";

type Downloadable = {
  kind: MediaKind;
  originalKey: string;
  originalFilename: string;
  displayKey: string | null;
  playbackKey: string | null;
};

/**
 * Which object a bulk download actually hands over for one memory.
 *
 * `original` is the file exactly as the phone sent it — the copy this app
 * treats as sacred. `compressed` is the derivative the app made: a photo's
 * display WebP, a clip's transcoded MP4.
 *
 * Compressed falls back to the original rather than dropping the memory out of
 * the archive, because "there is no smaller copy" is usually the *good* case:
 * a clip is only left untranscoded when it was already an ordinary, sensibly
 * sized MP4. The viewer's per-memory buttons can afford to hide themselves
 * instead; a batch that quietly skipped four photos could not.
 */
export function pickDownloadVariant(
  memory: Downloadable,
  variant: DownloadVariant,
): { key: string; name: string } {
  const base = memory.originalFilename.replace(/\.[^.]+$/, "") || "memory";
  if (variant === "compressed") {
    if (memory.kind === "video" && memory.playbackKey) {
      return { key: memory.playbackKey, name: `${base}.mp4` };
    }
    if (memory.kind === "image" && memory.displayKey) {
      return { key: memory.displayKey, name: `${base}.webp` };
    }
  }
  return { key: memory.originalKey, name: memory.originalFilename };
}
