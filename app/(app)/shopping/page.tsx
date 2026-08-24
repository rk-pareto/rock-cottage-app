import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/membership";
import { getOpenShoppingItems, getPickedUpShoppingItems } from "@/lib/shopping";
import { ShoppingClient, type Row } from "./ShoppingClient";

export const metadata: Metadata = { title: "Shopping · Rock Cottage" };

export default async function ShoppingPage() {
  const member = await requireMember();
  const [open, pickedUp] = await Promise.all([
    getOpenShoppingItems(),
    getPickedUpShoppingItems(),
  ]);

  const toRow = (r: Awaited<ReturnType<typeof getOpenShoppingItems>>[number]): Row => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    requestedBy: r.requestedBy,
    requestedByMemberId: r.requestedByMemberId,
    pickedUpAt: r.pickedUpAt ? r.pickedUpAt.toISOString() : null,
    pickedUpBy: r.pickedUpBy,
  });

  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Shopping</h1>
      <p className="mb-6 text-sm text-muted">
        Whoever&apos;s next into town grabs what&apos;s on the list.
      </p>
      <ShoppingClient
        open={open.map(toRow)}
        pickedUp={pickedUp.map(toRow)}
        currentMemberId={member.id}
        isAdmin={member.isAdmin}
      />
    </>
  );
}
