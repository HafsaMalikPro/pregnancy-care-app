import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { Container } from "@/components/shell";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getArticles } from "@/lib/public-api";
import { ArticleCard } from "./article-card";

const PAGE_SIZE = 9;

export const metadata: Metadata = {
  title: "Learn",
  description:
    "Practical pregnancy articles on nutrition, wellbeing, sleep and preparing for birth, each reviewed by a clinician.",
  alternates: { canonical: "/articles" },
};

export default async function ArticlesPage({ searchParams }: PageProps<"/articles">) {
  const raw = Number((await searchParams).page ?? 1);
  const pageNumber = Number.isInteger(raw) && raw > 0 ? raw : 1;
  // Throws when the API is unreachable, so the error page offers a retry.
  const data = await getArticles(PAGE_SIZE, (pageNumber - 1) * PAGE_SIZE);
  const items = data?.items ?? [];
  const total = data?.page.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [first, ...rest] = items;

  return (
    <Container>
      <PageHeader
        title="Learn"
        subtitle="Clear, practical articles for every stage. Each one is reviewed by a clinician before it's published."
      />

      {items.length === 0 ? (
        <EmptyState title={pageNumber > 1 ? "No more articles" : "No articles yet"}>
          {pageNumber > 1 ? (
            <ButtonLink href="/articles" variant="secondary" className="mt-4">
              Back to the latest articles
            </ButtonLink>
          ) : (
            "New articles are being reviewed. Meanwhile, browse the weekly guides."
          )}
        </EmptyState>
      ) : (
        <>
          {pageNumber === 1 && first ? (
            <>
              <ArticleCard article={first} featured />
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {rest.map((a) => (
                  <li key={a.slug}>
                    <ArticleCard article={a} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <li key={a.slug}>
                  <ArticleCard article={a} />
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-4">
              {pageNumber > 1 ? (
                <ButtonLink href={`/articles?page=${pageNumber - 1}`} variant="secondary">
                  <ChevronLeft className="size-4" aria-hidden /> Newer
                </ButtonLink>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted">
                Page {pageNumber} of {pages}
              </span>
              {pageNumber < pages && (
                <ButtonLink href={`/articles?page=${pageNumber + 1}`} variant="secondary">
                  Older <ChevronRight className="size-4" aria-hidden />
                </ButtonLink>
              )}
            </nav>
          )}
        </>
      )}
    </Container>
  );
}
