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
            <h1 className="font-display text-[2rem] leading-tight text-ink">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 text-base font-extrabold tracking-tight text-ink">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 label text-muted">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-bold text-lake underline decoration-lake/30 underline-offset-[3px] transition-colors hover:decoration-lake"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] text-ink-soft marker:text-line-strong">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[0.9375rem] text-ink-soft marker:text-muted">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-ink pl-4 text-[0.9375rem] text-ink">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">
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
            <th className="label border-b border-line-strong px-2 py-2 text-muted">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-line px-2 py-2.5 align-top text-ink-soft">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
