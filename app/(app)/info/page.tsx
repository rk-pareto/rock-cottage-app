import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth/membership";
import { PageHeader } from "@/components/ui/Card";
import { getInfoPages } from "@/lib/info";

export const metadata: Metadata = { title: "Cottage Info · Rock Cottage" };

export default async function InfoIndexPage() {
  await requireMember();
  const pages = await getInfoPages();

  return (
    <>
      <PageHeader title="Cottage Info" subtitle="Addresses, access, and who to call." />

      {pages.length === 0 ? (
        <p className="text-sm text-muted">No info pages yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line">
          {pages.map((page) => (
            <li key={page.slug} className="border-b border-line last:border-b-0">
              <Link
                href={`/info/${page.slug}`}
                className="tap flex items-center justify-between gap-3 bg-card px-4 py-3.5 transition-colors hover:bg-subtle active:bg-subtle"
              >
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-extrabold tracking-tight text-ink">
                    {page.title}
                  </span>
                  {page.description ? (
                    <span className="block text-sm text-muted">{page.description}</span>
                  ) : null}
                </span>
                <span aria-hidden="true" className="shrink-0 text-lg text-line-strong">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
