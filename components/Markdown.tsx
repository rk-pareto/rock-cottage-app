import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Server-rendered GitHub-flavoured Markdown. Raw HTML stays disabled (the
 * default) — the content is ours, but there's no reason to open that door.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-display text-2xl font-semibold text-ink">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 font-display text-lg font-semibold text-ink">{children}</h3>
          ),
          p: ({ children }) => <p className="text-base leading-relaxed text-ink">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-semibold text-lake underline underline-offset-2"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-ink">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-base text-ink">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="rounded-2xl border-l-4 border-amber bg-card px-4 py-3 text-sm text-muted">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-card px-1.5 py-0.5 font-mono text-sm text-ink">
              {children}
            </code>
          ),
          hr: () => <hr className="border-line" />,
          // Wide tables scroll inside their own box rather than the page.
          table: ({ children }) => (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-line px-2 py-2 font-bold text-ink">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-line px-2 py-2 align-top text-ink">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
