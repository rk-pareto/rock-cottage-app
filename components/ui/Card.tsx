import Link from "next/link";

/**
 * A surface, not a shadow box. On a white sheet the hairline does the work —
 * the shadow is a whisper that only exists so cards separate from the nav bar
 * when they scroll under it.
 */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-card p-4 shadow-[0_1px_1px_rgba(14,18,22,0.03)] ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * The page's opening bar: serif title, one line of context, hairline underneath.
 * Every screen uses it, which is most of why they now look related.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-line pb-4">
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-display text-[2rem] leading-[1.1] text-ink">{title}</h1>
        {action ? <div className="shrink-0 pb-1">{action}</div> : null}
      </div>
      {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
    </header>
  );
}

/**
 * Section eyebrow — a micro-label with a rule running out to the right edge.
 * This is the app's spine: the same mark repeats on every screen.
 */
export function SectionLabel({
  children,
  href,
  action = "See all",
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  action?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="label shrink-0 text-muted">{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-xs font-bold text-ink-soft transition-colors hover:text-ink"
        >
          {action} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted">{children}</p>;
}

/** Empty states that own the whole screen get the dashed well instead. */
export function EmptyWell({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">
      {children}
    </p>
  );
}
