import type { Metadata } from "next";
import { SignOutButton } from "@/components/SignOutButton";
import { requireMember } from "@/lib/auth/membership";
import { features } from "@/lib/features";

export const metadata: Metadata = { title: "Account · Rock Cottage" };

export default async function AccountPage() {
  const member = await requireMember();

  return (
    <>
      <h1 className="mb-6 font-display text-3xl font-semibold text-ink">Account</h1>

      <dl className="mb-6 flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Name</dt>
          <dd className="text-base font-bold text-ink">{member.displayName}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted">Email</dt>
          <dd className="break-all text-base text-ink">{member.email}</dd>
        </div>
        {member.isAdmin ? (
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">Role</dt>
            <dd className="text-base text-ink">Admin</dd>
          </div>
        ) : null}
      </dl>

      <SignOutButton className="w-full" />

      <p className="mt-6 text-center text-xs text-muted">
        Rock Cottage · {features.junoEnabled ? "Alice & Juno" : "Alice"}
      </p>
    </>
  );
}
