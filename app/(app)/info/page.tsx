import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth/membership";
import { getInfoPages } from "@/lib/info";

export const metadata: Metadata = { title: "Cottage Info · Rock Cottage" };

export default async function InfoIndexPage() {
  await requireMember();
  const pages = await getInfoPages();

  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Cottage Info</h1>
      <p className="mb-6 text-sm text-muted">Addresses, access, and who to call.</p>

      {pages.length === 0 ? (
        <p className="text-sm text-muted">No info pages yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pages.map((page) => (
            <li key={page.slug}>
              <Link
                href={`/info/${page.slug}`}
                className="tap flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4 active:bg-paper"
              >
                <span className="min-w-0">
                  <span className="block font-bold text-ink">{page.title}</span>
                  {page.description ? (
                    <span className="block text-sm text-muted">{page.description}</span>
                  ) : null}
                </span>
                <span aria-hidden="true" className="shrink-0 text-muted">
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
