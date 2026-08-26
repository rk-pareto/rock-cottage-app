import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/membership";
import { PageHeader } from "@/components/ui/Card";
import { getBringingItems } from "@/lib/bringing";
import { BringingClient } from "./BringingClient";

export const metadata: Metadata = { title: "Public Goods · Rock Cottage" };

export default async function BringingPage() {
  const member = await requireMember();
  const rows = await getBringingItems();

  return (
    <>
      <PageHeader
        title="Public Goods"
        subtitle="Claim it here so we don&rsquo;t end up with four bottles of mustard."
      />
      <BringingClient
        rows={rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          notes: r.notes,
          responsibleMemberId: r.responsibleMemberId,
          responsibleBy: r.responsibleBy,
          packed: r.packedAt !== null,
        }))}
        currentMemberId={member.id}
        isAdmin={member.isAdmin}
      />
    </>
  );
}
