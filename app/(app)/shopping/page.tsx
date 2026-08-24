import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/membership";
import { PageHeader } from "@/components/ui/Card";
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
      <PageHeader
        title="Shopping"
        subtitle="Whoever&rsquo;s next into town grabs what&rsquo;s on the list."
      />
      <ShoppingClient
        open={open.map(toRow)}
        pickedUp={pickedUp.map(toRow)}
        currentMemberId={member.id}
        isAdmin={member.isAdmin}
      />
    </>
  );
}
