import Link from "next/link";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(38,32,26,0.06)] ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  children,
  href,
  action = "See all",
}: {
  children: React.ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-semibold text-ink">{children}</h2>
      {href ? (
        <Link href={href} className="shrink-0 text-sm font-semibold text-lake">
          {action}
        </Link>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted">{children}</p>;
}
