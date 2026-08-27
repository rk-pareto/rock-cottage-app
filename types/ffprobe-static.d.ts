/**
 * `ffprobe-static` ships no types. It exports one thing: the absolute path to
 * the bundled binary for this platform (see lib/storage/ffmpeg.ts).
 */
declare module "ffprobe-static" {
  export const path: string;
}
