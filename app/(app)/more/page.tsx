import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth/membership";

export const metadata: Metadata = { title: "More · Rock Cottage" };

const LINKS = [
  { href: "/shopping", label: "Shopping", hint: "What we need from town", emoji: "🛒" },
  { href: "/bringing", label: "We're Bringing", hint: "Who's got the ketchup", emoji: "🧺" },
  { href: "/info", label: "Cottage Info", hint: "Address, wifi, emergency", emoji: "🗺️" },
  { href: "/account", label: "Account", hint: "Your details and sign out", emoji: "👤" },
] as const;

export default async function MorePage() {
  await requireMember();

  return (
    <>
      <h1 className="mb-6 font-display text-3xl font-semibold text-ink">More</h1>
      <ul className="flex flex-col gap-3">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="tap flex items-center gap-4 rounded-3xl border border-line bg-card p-4 active:bg-paper"
            >
              <span aria-hidden="true" className="text-2xl">
                {link.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-semibold text-ink">
                  {link.label}
                </span>
                <span className="block text-sm text-muted">{link.hint}</span>
              </span>
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
