import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { requireMember } from "@/lib/auth/membership";
import { getInfoPage, getInfoPages } from "@/lib/info";

export async function generateMetadata({
  params,
}: PageProps<"/info/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await getInfoPage(slug);
  return { title: page ? `${page.title} · Rock Cottage` : "Rock Cottage" };
}

export async function generateStaticParams() {
  const pages = await getInfoPages();
  return pages.map((page) => ({ slug: page.slug }));
}

export default async function InfoPage({ params }: PageProps<"/info/[slug]">) {
  await requireMember();
  const { slug } = await params;
  const page = await getInfoPage(slug);
  if (!page) notFound();

  return (
    <>
      <Link
        href="/info"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-bold text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">←</span> Cottage Info
      </Link>
      <article className="border-t border-line pt-6">
        <Markdown>{page.body}</Markdown>
      </article>
    </>
  );
}
