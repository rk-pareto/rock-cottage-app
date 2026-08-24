import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const INFO_DIR = path.join(process.cwd(), "content", "info");

export type InfoPage = {
  slug: string;
  title: string;
  order: number;
  description?: string;
  body: string;
};

/** One Markdown file = one page. Filename is the slug (spec §13). */
export async function getInfoPages(): Promise<InfoPage[]> {
  let filenames: string[];
  try {
    filenames = await readdir(INFO_DIR);
  } catch {
    return [];
  }

  const pages = await Promise.all(
    filenames
      .filter((f) => f.endsWith(".md"))
      .map(async (filename) => {
        const raw = await readFile(path.join(INFO_DIR, filename), "utf8");
        const { data, content } = matter(raw);
        const slug = filename.replace(/\.md$/, "");
        return {
          slug,
          title: typeof data.title === "string" ? data.title : slug,
          order: typeof data.order === "number" ? data.order : 999,
          description: typeof data.description === "string" ? data.description : undefined,
          body: content,
        };
      }),
  );

  return pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export async function getInfoPage(slug: string): Promise<InfoPage | null> {
  // Guard against traversal — the slug comes from the URL.
  if (!/^[a-z0-9-]+$/i.test(slug)) return null;
  const pages = await getInfoPages();
  return pages.find((p) => p.slug === slug) ?? null;
}
