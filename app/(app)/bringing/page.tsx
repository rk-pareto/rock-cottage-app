import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/membership";
import { getBringingItems } from "@/lib/bringing";
import { BringingClient } from "./BringingClient";

export const metadata: Metadata = { title: "We're Bringing · Rock Cottage" };

export default async function BringingPage() {
  const member = await requireMember();
  const rows = await getBringingItems();

  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">We&apos;re Bringing</h1>
      <p className="mb-6 text-sm text-muted">
        Claim it here so we don&apos;t end up with four bottles of mustard.
      </p>
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
