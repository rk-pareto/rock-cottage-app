"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true" {...stroke}>
      {children}
    </svg>
  );
}

export function BottomNav({ dogsLabel }: { dogsLabel: string }) {
  const pathname = usePathname();

  const items: Item[] = [
    {
      href: "/",
      label: "Home",
      icon: (
        <Icon>
          <path d="M3.5 10.5 12 3.5l8.5 7" />
          <path d="M5.5 9.5V20h13V9.5" />
        </Icon>
      ),
    },
    {
      href: "/meals",
      label: "Meals",
      icon: (
        <Icon>
          <path d="M6 3v8a2.5 2.5 0 0 0 5 0V3" />
          <path d="M8.5 11v10" />
          <path d="M17.5 3c-1.5 1.5-2 3.5-2 5.5s.7 3 2 3.5V21" />
        </Icon>
      ),
    },
    {
      href: "/dogs",
      label: dogsLabel,
      icon: (
        <Icon>
          <path d="M5.5 10.5c0-1 .8-1.8 1.8-1.8h9.4c1 0 1.8.8 1.8 1.8v3.9a4.6 4.6 0 0 1-4.6 4.6h-3.8a4.6 4.6 0 0 1-4.6-4.6z" />
          <path d="M5.6 9 4.2 5.2 7.6 7" />
          <path d="M18.4 9l1.4-3.8L16.4 7" />
          <path d="M10 13h.01M14 13h.01" />
        </Icon>
      ),
    },
    {
      href: "/photos",
      label: "Photos",
      icon: (
        <Icon>
          <path d="M3.5 8.5a1.8 1.8 0 0 1 1.8-1.8h2.2l1.3-2h6.4l1.3 2h2.2a1.8 1.8 0 0 1 1.8 1.8v9a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z" />
          <circle cx="12" cy="13" r="3.4" />
        </Icon>
      ),
    },
    {
      href: "/more",
      label: "More",
      icon: (
        <Icon>
          <circle cx="5.5" cy="12" r="1.3" />
          <circle cx="12" cy="12" r="1.3" />
          <circle cx="18.5" cy="12" r="1.3" />
        </Icon>
      ),
    },
  ];

  // /shopping, /bringing, /info and /account all live under "More".
  const moreRoutes = ["/shopping", "/bringing", "/info", "/account", "/more"];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/80 backdrop-blur-xl safe-bottom">
      <ul className="mx-auto flex max-w-3xl items-stretch">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/more"
                ? moreRoutes.some((r) => pathname.startsWith(r))
                : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`tap relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors active:bg-subtle ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                {/* The active tab is marked by a rule that meets the nav's own
                    top border — the same hairline language as the sections. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -top-px mx-auto h-0.5 w-8 rounded-full bg-pine transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                {item.icon}
                <span
                  className={`text-[10.5px] tracking-tight ${active ? "font-extrabold" : "font-semibold"}`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
