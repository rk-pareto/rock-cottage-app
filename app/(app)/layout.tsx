import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BottomNav } from "@/components/navigation/BottomNav";
import { SignOutButton } from "@/components/SignOutButton";
import { getMembership } from "@/lib/auth/membership";
import { dogsNavLabel } from "@/lib/features";

// Every authenticated page reads live cottage data — never statically cache it.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const membership = await getMembership();

  if (membership.state === "unauthenticated") redirect("/auth/sign-in");

  if (membership.state === "unauthorized") {
    return <Unauthorized email={membership.email} />;
  }

  return (
    <>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-28">{children}</main>
      <BottomNav dogsLabel={dogsNavLabel()} />
    </>
  );
}

/**
 * Authenticated with Neon Auth, but not on the cottage allowlist. No
 * application data is rendered here (spec §6.2).
 */
function Unauthorized({ email }: { email: string | null }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-7 px-6 py-12">
      <div>
        <p className="label text-clay">Access</p>
        <h1 className="mt-2 font-display text-[2rem] leading-tight text-ink">Not on the list</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {email ? (
            <>
              <span className="font-semibold text-ink">{email}</span> isn&apos;t one of the
              cottage accounts.
            </>
          ) : (
            <>That account isn&apos;t one of the cottage accounts.</>
          )}{" "}
          Ask Ryan to add you, then sign in again.
        </p>
      </div>
      <SignOutButton />
    </main>
  );
}
