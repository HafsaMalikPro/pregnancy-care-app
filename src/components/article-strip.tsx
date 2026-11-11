import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { TopicPhoto, topicFor, type Topic } from "@/components/art";
import { formatDate } from "@/lib/dates";
import type { ArticleSummary } from "@/lib/types";

const TOPIC_LABEL: Record<Topic, string> = {
  nutrition: "Nutrition",
  movement: "Exercise",
  sleep: "Sleep",
  baby: "Baby",
  wellbeing: "Wellbeing",
  care: "Check-ups",
};

/** Shown while no articles are published (or the API is unreachable); they lead to Learn. */
const FALLBACK_ARTICLES = [
  { title: "Healthy Eating During Pregnancy", tag: "Nutrition", meta: "5 min read", topic: "nutrition" },
  { title: "Gentle Exercises for Expecting Mums", tag: "Exercise", meta: "4 min read", topic: "movement" },
  { title: "Understanding Your Symptoms", tag: "Wellbeing", meta: "6 min read", topic: "wellbeing" },
  { title: "Preparing for Birth", tag: "Birth", meta: "7 min read", topic: "care" },
] as const satisfies readonly { title: string; tag: string; meta: string; topic: Topic }[];

function articleCards(items: ArticleSummary[]) {
  if (items.length === 0)
    return FALLBACK_ARTICLES.map((a) => ({ ...a, href: "/articles", slug: undefined as string | undefined }));
  return items.slice(0, 4).map((a) => {
    const topic = topicFor(`${a.slug} ${a.title}`);
    return {
      href: `/articles/${a.slug}`,
      slug: a.slug as string | undefined,
      title: a.title,
      tag: a.premium ? "Premium" : TOPIC_LABEL[topic],
      meta: formatDate(a.publishedAt, { day: "numeric", month: "long", year: "numeric" }),
      topic,
    };
  });
}

/** "Helpful articles for you": four photo cards with a topic tag. */
export function ArticleStrip({ articles }: { articles: ArticleSummary[] }) {
  return (
    <section className="rounded-3xl border border-white/80 bg-card/80 p-5 shadow-soft sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-lg font-bold sm:text-xl">Helpful articles for you</h2>
        <Link
          href="/articles"
          className="inline-flex items-center gap-1 text-sm font-bold text-clay-strong hover:underline"
        >
          View all <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {articleCards(articles).map((a) => (
          <li key={a.href + a.title}>
            <Link
              href={a.href}
              className="group flex h-full flex-col rounded-2xl border border-white bg-card p-2 shadow-soft transition hover:-translate-y-0.5 hover:border-clay/30"
            >
              <span className="relative block">
                <TopicPhoto
                  topic={a.topic}
                  slug={a.slug}
                  decorative
                  sizes="(min-width: 1024px) 16rem, (min-width: 640px) 50vw, 100vw"
                  className="aspect-2/1 h-auto w-full rounded-xl object-cover"
                />
                <span className="absolute -bottom-2.5 left-3 rounded-md bg-clay px-2.5 py-0.5 text-[0.7rem] font-bold text-white shadow-sm">
                  {a.tag}
                </span>
              </span>
              <span className="flex flex-1 flex-col px-2 pb-2 pt-5">
                <h3 className="font-sans text-[0.95rem] font-bold leading-snug text-slate group-hover:text-clay-strong">
                  {a.title}
                </h3>
                <span className="mt-2 text-xs font-semibold text-muted">{a.meta}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
