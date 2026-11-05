import { CloudOff, Info, Stethoscope } from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { ArticleCard } from "@/app/(public)/articles/article-card";
import { TRIMESTER_NAMES } from "@/components/week-hero";
import { cx } from "@/lib/cx";
import { TRIMESTER_WEEKS, mergeRuns, type Trimester } from "@/lib/topics";
import type { ArticleSummary } from "@/lib/types";

/**
 * Building blocks shared by the topic pages (nutrition, exercise, baby care, birth and
 * postpartum). Server components: everything shown comes from published, reviewed content.
 */

export function TopicHero({
  title,
  intro,
  art,
  children,
}: {
  title: string;
  intro: string;
  art: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative mb-8 grid items-center gap-6 overflow-hidden rounded-[2rem] bg-linear-to-r from-paper-2 via-blush to-blush px-6 py-8 sm:px-10 sm:py-10 md:grid-cols-[1.4fr_1fr]">
      <div>
        <h1 className="font-sans text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">{intro}</p>
        {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
      </div>
      <div className="mx-auto w-full max-w-72 md:max-w-80">{art}</div>
    </section>
  );
}

/** The page title row from the app screens: a back link, title and subtitle. */
export function ScreenHeader({
  title,
  subtitle,
  fallback,
  fallbackLabel,
}: {
  title: string;
  subtitle: string;
  fallback?: string;
  fallbackLabel?: string;
}) {
  return (
    <header className="mb-6">
      <BackLink fallback={fallback} fallbackLabel={fallbackLabel} />
      <h1 className="mt-3 font-sans text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-1 text-muted">{subtitle}</p>
    </header>
  );
}

export function SectionHeading({
  id,
  title,
  intro,
}: {
  id?: string;
  title: string;
  intro?: React.ReactNode;
}) {
  return (
    <div className="mb-4 max-w-2xl scroll-mt-24" id={id}>
      <h2 className="font-sans text-2xl font-bold tracking-tight">{title}</h2>
      {intro && <p className="mt-1.5 text-muted">{intro}</p>}
    </div>
  );
}

/** One disclosure per trimester; the first one with content starts open. */
export function ByTrimester<T>({
  groups,
  render,
  empty,
}: {
  groups: Record<Trimester, { week: number; value: T }[]>;
  render: (value: T) => React.ReactNode;
  empty: string;
}) {
  const firstWithContent = ([1, 2, 3] as const).find((t) => groups[t].length > 0);
  return (
    <div className="grid gap-3">
      {([1, 2, 3] as const).map((t) => {
        const items = groups[t];
        const [from, to] = TRIMESTER_WEEKS[t];
        return (
          <details
            key={t}
            open={t === firstWithContent}
            className="group rounded-3xl border border-line/70 bg-card shadow-soft open:pb-2"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block font-bold text-slate">{TRIMESTER_NAMES[t]}</span>
                <span className="text-sm text-muted">
                  Weeks {from}–{to} · {items.length === 0 ? "nothing published yet" : `${items.length} ${items.length === 1 ? "week" : "weeks"} with guidance`}
                </span>
              </span>
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-full bg-clay-soft text-clay-strong transition group-open:rotate-45"
              >
                +
              </span>
            </summary>
            {items.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-muted">{empty}</p>
            ) : (
              <ol className="grid gap-px px-2">
                {mergeRuns(items).map(({ from, to, value }) => (
                  <li key={from} className="grid gap-2 rounded-2xl px-3 py-3 sm:grid-cols-[7.5rem_1fr]">
                    <Link
                      href={`/weeks/${from}`}
                      className="h-fit w-fit rounded-full bg-clay-soft px-3 py-1 text-sm font-bold text-clay-strong hover:underline"
                    >
                      {from === to ? `Week ${from}` : `Weeks ${from}–${to}`}
                    </Link>
                    <div className="leading-relaxed">{render(value)}</div>
                  </li>
                ))}
              </ol>
            )}
          </details>
        );
      })}
    </div>
  );
}

export function BulletList({ items, tone = "rose" }: { items: string[]; tone?: "rose" | "sage" | "danger" }) {
  const dot = { rose: "bg-rose", sage: "bg-sage-bright", danger: "bg-danger" }[tone];
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className={cx("mt-2.5 size-1.5 shrink-0 rounded-full", dot)} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ArticleRow({
  articles,
  empty,
}: {
  articles: ArticleSummary[] | null;
  empty: string;
}) {
  if (articles === null) return <ApiDown what="articles" />;
  if (articles.length === 0)
    return (
      <p className="rounded-3xl border border-dashed border-line bg-card/60 px-5 py-6 text-muted">
        {empty}{" "}
        <Link href="/articles" className="font-semibold text-clay-strong underline">
          Browse all articles
        </Link>
        .
      </p>
    );
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {articles.slice(0, 6).map((a) => (
        <li key={a.slug}>
          <ArticleCard article={a} headingLevel="h3" />
        </li>
      ))}
    </ul>
  );
}

/** A feature the API doesn't support yet. Says so plainly; never shows sample data. */
export function NotAvailable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-3xl border border-dashed border-line bg-card/70 p-5">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-plum-soft text-plum">
        <Info className="size-5" />
      </span>
      <div>
        <h3 className="font-bold text-slate">{title}</h3>
        <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}

export function ApiDown({ what }: { what: string }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-3xl bg-warn-soft px-5 py-4 text-warn">
      <CloudOff className="size-5 shrink-0" aria-hidden />
      <p className="text-sm font-semibold">
        We can&apos;t load the {what} right now. Refresh the page in a moment.
      </p>
    </div>
  );
}

/** The standing reminder that this is general information, with who to ask instead. */
export function CareNote({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex gap-4 rounded-3xl bg-sage-soft p-5 text-sm leading-relaxed">
      <Stethoscope className="mt-0.5 size-5 shrink-0 text-sage" aria-hidden />
      <div>{children}</div>
    </aside>
  );
}
