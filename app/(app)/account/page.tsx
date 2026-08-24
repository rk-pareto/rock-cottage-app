import type { Metadata } from "next";
import { SignOutButton } from "@/components/SignOutButton";
import { PageHeader } from "@/components/ui/Card";
import { requireMember } from "@/lib/auth/membership";
import { features } from "@/lib/features";

export const metadata: Metadata = { title: "Account · Rock Cottage" };

export default async function AccountPage() {
  const member = await requireMember();

  return (
    <>
      <PageHeader title="Account" />

      {/* Label left, value right — the same ledger rhythm as the dog status. */}
      <dl className="mb-8 flex flex-col">
        <Field label="Name">
          <span className="font-bold">{member.displayName}</span>
        </Field>
        <Field label="Email">
          <span className="break-all">{member.email}</span>
        </Field>
        {member.isAdmin ? <Field label="Role">Admin</Field> : null}
      </dl>

      <SignOutButton className="w-full" />

      <p className="mt-8 text-center text-xs text-muted">
        Rock Cottage · {features.junoEnabled ? "Alice & Juno" : "Alice"}
      </p>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3.5">
      <dt className="label shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-[0.9375rem] text-ink">{children}</dd>
    </div>
  );
}
