import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/membership";
import { PageHeader } from "@/components/ui/Card";
import {
  getOpenShoppingItems,
  getPickedUpShoppingItems,
  withShoppingPhotoUrls,
  type ShoppingCard,
  type ShoppingRow,
} from "@/lib/shopping";
import { isStorageConfigured } from "@/lib/storage/s3";
import { ShoppingClient, type Row } from "./ShoppingClient";

export const metadata: Metadata = { title: "Shopping · Rock Cottage" };

export default async function ShoppingPage() {
  const member = await requireMember();
  const storageReady = isStorageConfigured();
  const [open, pickedUp] = await Promise.all([
    getOpenShoppingItems(),
    getPickedUpShoppingItems(),
  ]);

  // Signed photo URLs are short-lived, so they're minted per request here
  // rather than stored — same as the feed's attachments.
  const [openCards, pickedUpCards] = storageReady
    ? await Promise.all([withShoppingPhotoUrls(open), withShoppingPhotoUrls(pickedUp)])
    : [open.map(noPhoto), pickedUp.map(noPhoto)];

  const toRow = (r: ShoppingCard): Row => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    requestedBy: r.requestedBy,
    requestedByMemberId: r.requestedByMemberId,
    pickedUpAt: r.pickedUpAt ? r.pickedUpAt.toISOString() : null,
    pickedUpBy: r.pickedUpBy,
    photoUrl: r.photoUrl,
  });

  return (
    <>
      <PageHeader
        title="Shopping"
        subtitle="Whoever&rsquo;s next into town grabs what&rsquo;s on the list."
      />
      <ShoppingClient
        open={openCards.map(toRow)}
        pickedUp={pickedUpCards.map(toRow)}
        currentMemberId={member.id}
        isAdmin={member.isAdmin}
        storageReady={storageReady}
      />
    </>
  );
}

/** With no bucket configured there is nothing to sign — the list still works,
 *  it just has no pictures on it. */
const noPhoto = (r: ShoppingRow): ShoppingCard => ({ ...r, photoUrl: null });
