/**
 * What a memory tile with no thumbnail says about itself.
 *
 * `pending` and `processing` used to read identically — both rendered
 * "Processing…" — which is how an upload that died on someone's phone could
 * sit in the grid for days claiming to be a photo the server was busy
 * resizing. Nobody was ever going to work out that the bytes had never
 * arrived. They are different states and they say different things now:
 * waiting on a phone, working on it here, or done and gone wrong.
 *
 * Pure, and separate from the component, because this is exactly the sort of
 * mapping that gets quietly inverted later.
 */
export function placeholderLabel(memory: {
  processingStatus: string;
  uploadIncomplete: boolean;
}): string {
  if (memory.processingStatus === "processing") return "Processing…";
  if (memory.processingStatus === "pending") return "Uploading…";
  if (memory.processingStatus === "failed") {
    return memory.uploadIncomplete ? "Upload didn't finish" : "No preview";
  }
  // `ready` with nothing to show: a clip whose poster never rendered.
  return "No preview";
}
