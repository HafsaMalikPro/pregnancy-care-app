import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { Container } from "@/components/shell";
import { notFound } from "next/navigation";
import { TopicPhoto, topicFor } from "@/components/art";
import { Markdown, readingMinutes } from "@/components/markdown";
import { Badge, Breadcrumbs } from "@/components/ui";
import { ReviewFooter } from "@/components/week-guide";
import { formatDate } from "@/lib/dates";
import { getArticle, getArticles, optional } from "@/lib/public-api";
import { ArticleCard } from "../article-card";
import { PremiumBody } from "./premium-body";

export async function generateMetadata({
  params,
}: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await optional(getArticle(slug));
  if (!article) return { title: "Article" };
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: `/articles/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description: article.summary,
      publishedTime: article.publishedAt,
    },
  };
}

export default async function ArticlePage({ params }: PageProps<"/articles/[slug]">) {
  const { slug } = await params;
  // Fetched without credentials: premium bodies arrive locked and are unlocked in the
  // browser for entitled readers, so this cached page never holds premium content.
  const a = await getArticle(slug);
  if (!a) notFound();
  const related = (await optional(getArticles(4)))?.items.filter((x) => x.slug !== a.slug).slice(0, 3);

  return (
    <Container>
      <Breadcrumbs items={[{ href: "/articles", label: "Learn" }, { label: a.title }]} />
      <article className="mx-auto max-w-3xl">
        <TopicPhoto
          topic={topicFor(`${a.slug} ${a.title}`)}
          slug={a.slug}
          className="aspect-[2/1] w-full rounded-[2rem] object-cover shadow-soft sm:aspect-[5/2]"
          sizes="(min-width: 768px) 48rem, 100vw"
          priority
        />
        <div className="mt-8 flex flex-wrap items-center gap-2 text-sm text-muted">
          {a.premium && <Badge tone="warn">Premium</Badge>}
          {a.review && <Badge tone="success">Clinically reviewed</Badge>}
          {a.body && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden /> {readingMinutes(a.body)} min read
            </span>
          )}
          <span>
            Published {formatDate(a.publishedAt, { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
        <h1 className="mt-3 font-sans text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {a.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">{a.summary}</p>

        <div className="mt-8 border-t border-line pt-8">
          {a.locked || !a.body ? <PremiumBody slug={a.slug} /> : <Markdown>{a.body}</Markdown>}
        </div>

        <div className="mt-12">
          <ReviewFooter guide={a} />
        </div>
      </article>

      {related && related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 font-sans text-2xl font-bold">Keep reading</h2>
          <ul className="grid gap-5 sm:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <ArticleCard article={r} headingLevel="h3" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
