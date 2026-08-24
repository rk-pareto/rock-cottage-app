/**
 * `heic-decode` ships no types. Only the default single-image decode is used
 * (see lib/storage/process.ts).
 */
declare module "heic-decode" {
  export interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  export default function decode(input: { buffer: Buffer | Uint8Array }): Promise<DecodedImage>;
}
