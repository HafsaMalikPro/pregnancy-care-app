import { Apple, ArrowRight, Baby, CircleCheck, Dumbbell, HeartHandshake, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WombArt } from "@/components/art";
import { ArticleStrip } from "@/components/article-strip";
import { Heart, LeafBranch } from "@/components/decor";
import { Shell } from "@/components/shell";
import { ButtonLink } from "@/components/ui";
import { cx } from "@/lib/cx";
import { getArticles, optional } from "@/lib/public-api";

const TRIMESTERS = [
  { name: "1st Trimester", weeks: "Weeks 1–13", stage: "Foundation", art: 10 },
  { name: "2nd Trimester", weeks: "Weeks 14–27", stage: "Growth", art: 22 },
  { name: "3rd Trimester", weeks: "Weeks 28–42", stage: "Preparation", art: 34 },
] as const;

/** Tile colours taken from the design mock-up. */
const TILES = [
  { icon: Apple, tone: "bg-blush text-[#e0383e]", title: "Nutrition", text: "Eating well, week by week", href: "/nutrition" },
  { icon: Dumbbell, tone: "bg-[#ece4fb] text-[#7a52d6]", title: "Exercise", text: "Gentle, safe movement", href: "/exercise" },
  { icon: Baby, tone: "bg-[#fde6d3] text-[#e8792b]", title: "Baby Development", text: "Week by week", href: "/weeks" },
  { icon: HeartHandshake, tone: "bg-blush text-[#e0457a]", title: "Baby Care", text: "Getting ready", href: "/baby-care" },
] as const;

const TRUST = ["Clinically reviewed", "Privacy first", "Built around your due date"];

const card = "rounded-3xl border border-white/80 bg-card shadow-soft";

export default async function HomePage() {
  const articles = await optional(getArticles(4));

  return (
    <Shell variant="public">
      {/* Hero */}
      <section className="relative overflow-hidden bg-linear-to-r from-paper via-paper-2 to-blush">
        <div className="mx-auto grid max-w-6xl items-end gap-2 px-4 pt-8 sm:pt-12 lg:min-h-136 lg:grid-cols-[1.05fr_1fr]">
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

          <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
            {/* Blush shapes, hearts and leaves around the cut-out, as in the design */}
            <div aria-hidden className="absolute inset-0">
              <span className="absolute left-[10%] top-[30%] size-[46%] rounded-full bg-blush" />
              <span className="absolute right-[4%] top-[8%] size-[38%] rounded-full bg-blush" />
              <span className="absolute bottom-0 left-[14%] h-[55%] w-[74%] rounded-t-[999px] bg-blush" />
            </div>
            <Heart className="absolute left-[6%] top-[16%] size-6 text-[#f08aa5]" />
            <Heart className="absolute right-[8%] top-[6%] size-8 text-[#f5a3b8]" />
            <Heart className="absolute right-[2%] top-[40%] size-4 text-[#f08aa5]" />
            <LeafBranch className="absolute -left-4 bottom-0 h-56 w-40" />
            <LeafBranch flip className="absolute -right-6 bottom-6 h-64 w-44" />
            <Image
              src="/assets/illustrations/mother-cutout.png"
              alt="Illustration of a pregnant woman holding her bump, surrounded by leaves and flowers"
              width={1179}
              height={1187}
              priority
              sizes="(min-width: 1024px) 34rem, 28rem"
              className="relative h-auto w-full"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-5 px-4 pb-16">
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

        {/* Topic tiles */}
        <section id="features" aria-label="Explore by topic" className="scroll-mt-24">
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TILES.map(({ icon: Icon, tone, title, text, href }) => (
              <li key={title}>
                <Link
                  href={href}
                  className={cx(
                    card,
                    "flex h-full flex-col items-center px-4 py-6 text-center transition hover:-translate-y-0.5 hover:border-clay/30",
                  )}
                >
                  <span aria-hidden className={cx("grid size-14 place-items-center rounded-full", tone)}>
                    <Icon className="size-7" strokeWidth={2.2} />
                  </span>
                  <span className="mt-3 text-base font-bold text-slate">{title}</span>
                  <span className="mt-0.5 text-sm text-muted">{text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Trust strip */}
        <section
          aria-labelledby="trust-heading"
          className="relative overflow-hidden rounded-3xl bg-card/70 px-5 py-6 text-center shadow-soft"
        >
          <LeafBranch className="absolute -bottom-6 -left-3 h-32 w-24 opacity-90" />
          <LeafBranch flip className="absolute -bottom-6 -right-3 h-32 w-24 opacity-90" />
          <h2 id="trust-heading" className="font-sans text-base font-bold sm:text-lg">
            Trusted Guidance for a Healthy Pregnancy
          </h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CircleCheck className="size-4 text-sage" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </section>

        <ArticleStrip articles={articles?.items ?? []} />
      </div>
    </Shell>
  );
}
