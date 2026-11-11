import { ArrowRight, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WombArt } from "@/components/art";
import { ArticleStrip } from "@/components/article-strip";
import { CommonQuestions, SupportBand, TopicHub, TrustBand, UrgentHelp } from "@/components/home-sections";
import { Shell } from "@/components/shell";
import { ButtonLink } from "@/components/ui";
import { getArticles, getSiteStats, optional } from "@/lib/public-api";

const TRIMESTERS = [
  { name: "1st Trimester", weeks: "Weeks 1–13", stage: "Foundation", art: 10 },
  { name: "2nd Trimester", weeks: "Weeks 14–27", stage: "Growth", art: 22 },
  { name: "3rd Trimester", weeks: "Weeks 28–42", stage: "Preparation", art: 34 },
] as const;


export default async function HomePage() {
  const [articles, stats] = await Promise.all([optional(getArticles(4)), getSiteStats()]);

  return (
    <Shell variant="public">
      {/* Hero */}
      <section className="relative overflow-hidden bg-linear-to-r from-paper via-paper-2 to-blush">
        {/* Fade the hero's blush into the page so it has no hard bottom edge. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-paper" />
        <div className="grid w-full items-center gap-6 px-4 sm:px-8 lg:px-12 xl:px-16 pt-8 pb-14 sm:pt-12 lg:min-h-136 lg:grid-cols-[1fr_1.1fr]">
          <div className="relative z-10 self-center py-4 lg:pb-16">
            <h1 className="font-sans text-[2.25rem] font-extrabold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.35rem]">
              Your Complete Pregnancy Journey, From First Week to Baby&apos;s First Days.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
              Follow your pregnancy week by week, with guidance on nutrition, gentle exercise
              and baby care, reviewed by clinicians.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink
                href="/signup"
                className="min-h-13 bg-linear-to-b from-clay to-clay-strong px-7 text-base shadow-[0_12px_24px_-12px_rgb(208_50_95/0.7)]"
              >
                Start Your Journey <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink
                href="/journey"
                variant="secondary"
                className="min-h-13 border-clay/30 bg-card px-7 text-base text-slate shadow-soft hover:text-clay-strong"
              >
                <PlayCircle className="size-4 text-clay-strong" aria-hidden /> Explore Guide
              </ButtonLink>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
            {/* Watercolour art with its own hearts and leaves. Multiply blends its paper into the
                hero's blush; the mask softens the edges so there is no visible box. */}
            <Image
              src="/assets/illustrations/mother-watercolor.png"
              alt="Watercolour illustration of a smiling pregnant woman holding her bump, with hearts and leaves"
              width={1106}
              height={960}
              priority
              sizes="(min-width: 1024px) 50vw, 90vw"
              className="h-auto w-full mix-blend-multiply [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_72%,transparent_100%)]"
            />
          </div>
        </div>
      </section>

      <div className="w-full space-y-10 px-4 sm:px-8 lg:px-12 xl:px-16 pb-16">
        {/* Your 9-month journey at a glance */}
        <section
          aria-labelledby="glance-heading"
          className="relative -mt-6 rounded-3xl bg-linear-to-b from-blush to-paper-2 px-5 py-6 shadow-soft sm:px-8"
        >
          <h2 id="glance-heading" className="text-center font-sans text-lg font-bold sm:text-xl">
            Your 9-Month Journey at a Glance
          </h2>
          <ol className="relative mt-6 grid grid-cols-3 gap-2">
            <span
              aria-hidden
              className="absolute left-[16%] right-[16%] top-7 border-t-2 border-dashed border-clay/30"
            />
            {TRIMESTERS.map((t) => (
              <li key={t.name}>
                <Link href="/journey" className="group relative flex flex-col items-center text-center">
                  <span className="grid size-14 place-items-center rounded-full bg-card shadow-soft ring-4 ring-blush">
                    <WombArt week={t.art} size={48} className="size-11" />
                  </span>
                  <span className="mt-3 text-sm font-bold text-slate group-hover:text-clay-strong sm:text-base">
                    {t.name}
                  </span>
                  <span className="text-xs text-muted sm:text-sm">{t.weeks}</span>
                  <span className="text-xs text-muted">{t.stage}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <TopicHub />
        <TrustBand stats={stats} />
        <ArticleStrip articles={articles?.items ?? []} />
        <UrgentHelp />
        <CommonQuestions />
        <SupportBand />
      </div>
    </Shell>
  );
}
