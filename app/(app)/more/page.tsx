import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/Card";
import { requireMember } from "@/lib/auth/membership";

export const metadata: Metadata = { title: "More · Rock Cottage" };

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/* Line glyphs rather than emoji: emoji render differently on every phone and
   drag the whole page back toward a group chat. */
const LINKS = [
  {
    href: "/shopping",
    label: "Shopping",
    hint: "What we need from town",
    icon: (
      <Glyph>
        <path d="M4 5h2l2.2 9.4a1.6 1.6 0 0 0 1.6 1.2h7a1.6 1.6 0 0 0 1.6-1.2L20 8H6.5" />
        <circle cx="10" cy="19" r="1.2" />
        <circle cx="17" cy="19" r="1.2" />
      </Glyph>
    ),
  },
  {
    href: "/bringing",
    label: "Public Good",
    hint: "Who's got the ketchup",
    icon: (
      <Glyph>
        <path d="M4.5 9h15l-1.2 9.2a1.8 1.8 0 0 1-1.8 1.6H7.5a1.8 1.8 0 0 1-1.8-1.6z" />
        <path d="M9 9V6.5a3 3 0 0 1 6 0V9" />
      </Glyph>
    ),
  },
  {
    href: "/info",
    label: "Cottage Info",
    hint: "Address, wifi, emergency",
    icon: (
      <Glyph>
        <path d="M9.5 4.5 4 6.8v12.7l5.5-2.3 5 2.3 5.5-2.3V4.5l-5.5 2.3z" />
        <path d="M9.5 4.5v12.7M14.5 6.8v12.7" />
      </Glyph>
    ),
  },
  {
    href: "/account",
    label: "Account",
    hint: "Your details and sign out",
    icon: (
      <Glyph>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19.5a7 7 0 0 1 14 0" />
      </Glyph>
    ),
  },
] as const;

export default async function MorePage() {
  await requireMember();

  return (
    <>
      <PageHeader title="More" />
      <ul className="overflow-hidden rounded-2xl border border-line">
        {LINKS.map((link) => (
          <li key={link.href} className="border-b border-line last:border-b-0">
            <Link
              href={link.href}
              className="tap flex items-center gap-4 bg-card px-4 py-3.5 transition-colors hover:bg-subtle active:bg-subtle"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink-soft">
                {link.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-extrabold tracking-tight text-ink">
                  {link.label}
                </span>
                <span className="block text-sm text-muted">{link.hint}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-lg text-line-strong">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
