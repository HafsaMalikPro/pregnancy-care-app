import Link from "next/link";
import { TopicArt, topicFor } from "@/components/art";
import { Badge } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatDate } from "@/lib/dates";
import type { ArticleSummary } from "@/lib/types";

export function ArticleCard({
  article: a,
  featured = false,
  headingLevel: H = "h2",
}: {
  article: ArticleSummary;
  featured?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <Link
      href={`/articles/${a.slug}`}
      className={cx(
        "group flex h-full overflow-hidden rounded-[1.75rem] border border-line/70 bg-card shadow-soft transition hover:border-clay/40",
        featured ? "flex-col md:flex-row" : "flex-col",
      )}
    >
      <TopicArt
        topic={topicFor(`${a.slug} ${a.title}`)}
        className={cx("h-auto w-full object-cover", featured && "md:w-1/2")}
      />
      <div className={cx("flex flex-1 flex-col p-5", featured && "md:justify-center md:p-8")}>
        {a.premium && (
          <span className="mb-2">
            <Badge tone="warn">Premium</Badge>
          </span>
        )}
        <H
          className={cx(
            "font-sans font-bold leading-snug text-slate group-hover:text-clay-strong",
            featured ? "text-2xl sm:text-3xl" : "text-lg",
          )}
        >
          {a.title}
        </H>
        <p className={cx("mt-2 flex-1 text-muted", !featured && "line-clamp-3 text-sm")}>
          {a.summary}
        </p>
        <p className="mt-4 text-xs font-semibold text-muted">
          {formatDate(a.publishedAt, { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>
    </Link>
  );
}
