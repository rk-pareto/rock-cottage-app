import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/membership";
import { getMemoriesByIds, uploadIncomplete } from "@/lib/memories";
import {
  archiveFilename,
  entryNames,
  pickDownloadVariant,
  zipStream,
} from "@/lib/storage/archive";
import { getObjectStream, presignDownload } from "@/lib/storage/s3";
import { bulkDownloadSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Bulk download: one ZIP of everything currently selected on `/memories`.
 *
 * A POST rather than a link because "select all" is far more ids than a URL
 * will carry, and a real form submission rather than `fetch()` because the
 * browser then streams the archive straight to disk — a selection of clips is
 * gigabytes, which is not something a phone can hold in a Blob.
 *
 * That also decides the error shape: the browser is *navigating* here, so a
 * JSON error body would replace the app with a page of JSON. Every failure
 * before the first byte instead sends the member back to `/memories` with a
 * reason the client turns into a toast.
 */
export async function POST(request: Request) {
  try {
    await requireMember();
  } catch {
    return back(request, "signed-out");
  }

  const form = await request.formData().catch(() => null);
  const parsed = bulkDownloadSchema.safeParse({
    variant: form?.get("variant"),
    ids: form?.getAll("id").map(String) ?? [],
  });
  if (!parsed.success) return back(request, "error");

  const memories = await getMemoriesByIds(parsed.data.ids);
  // A row whose bytes never reached the bucket has nothing to put in the
  // archive — not the original, not a derivative made from it.
  const present = memories.filter((memory) => !uploadIncomplete(memory));
  if (present.length === 0) return back(request, "empty");

  const picks = present.map((memory) => pickDownloadVariant(memory, parsed.data.variant));
  const names = entryNames(picks.map((pick) => pick.name));

  // One memory is not an archive. Hand back the file itself, exactly as the
  // per-memory Download button in the viewer does.
  if (picks.length === 1) {
    return NextResponse.redirect(await presignDownload(picks[0].key, names[0]), 303);
  }

  const archive = zipStream(
    picks.map((pick, index) => ({
      name: names[index],
      date: present[index].createdAt,
      open: async () => (await getObjectStream(pick.key)).body,
    })),
  );

  return new NextResponse(archive, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${archiveFilename()}"`,
      // Built on the fly from a selection that will never repeat exactly, and
      // `no-transform` keeps a proxy from spending CPU gzipping a ZIP.
      "cache-control": "no-store, no-transform",
    },
  });
}

/** Back to the gallery, carrying why nothing downloaded. */
function back(request: Request, reason: "signed-out" | "error" | "empty") {
  return NextResponse.redirect(new URL(`/memories?download=${reason}`, request.url), 303);
}
