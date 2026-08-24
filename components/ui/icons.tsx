/** A drawn tick, so the checkbox doesn't depend on a text glyph's metrics. */
export function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function PlayGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

/** Outline by default; fills solid when a memory is favorited. */
export function HeartGlyph({
  filled = false,
  className = "",
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.2c-.3 0-.6-.1-.8-.3-2.5-2.2-4.6-4.1-6.1-5.9C3.5 12 2.7 10.3 2.7 8.5 2.7 5.9 4.8 3.9 7.3 3.9c1.5 0 2.9.7 3.8 1.9l.9 1.1.9-1.1c.9-1.2 2.3-1.9 3.8-1.9 2.5 0 4.6 2 4.6 4.6 0 1.8-.8 3.5-2.4 5.5-1.5 1.8-3.6 3.7-6.1 5.9-.2.2-.5.3-.8.3z" />
    </svg>
  );
}
