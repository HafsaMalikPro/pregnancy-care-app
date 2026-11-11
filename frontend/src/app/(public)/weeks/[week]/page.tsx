import { ArrowRight, ChevronLeft, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { LeafBranch } from "@/components/decor";
import { Container } from "@/components/shell";
import { ButtonLink } from "@/components/ui";
import { WeekGuideView } from "@/components/week-guide";
import { TRIMESTER_NAMES, trimesterOf } from "@/components/week-hero";
import { WeekStrip } from "@/components/week-strip";
import { cx } from "@/lib/cx";
import { SYMPTOMS } from "@/lib/labels";
import { getWeekGuide } from "@/lib/public-api";
import { TRIMESTER_WEEKS } from "@/lib/topics";
import type { SymptomCode } from "@/lib/types";
import { YourWeekNote } from "./your-week-note";

const parseWeek = (raw: string) => {
  const week = Number(raw);
  return Number.isInteger(week) && week >= 1 && week <= 42 ? week : null;
};

export async function generateMetadata({ params }: PageProps<"/weeks/[week]">): Promise<Metadata> {
  const week = parseWeek((await params).week);
  if (!week) return {};
  const guide = await getWeekGuide(week).catch(() => null);
  return {
    title: guide ? `Week ${week}: ${guide.title}` : `Pregnancy week ${week}`,
    description:
      guide?.summary ?? `What to expect in week ${week} of pregnancy, for you and your baby.`,
    alternates: { canonical: `/weeks/${week}` },
  };
}

const card = "rounded-3xl border border-white/80 bg-card p-5 shadow-soft sm:p-6";

export default async function WeekPage({ params }: PageProps<"/weeks/[week]">) {
  const week = parseWeek((await params).week);
  if (!week) notFound();
  // Throws when the API is unreachable, so the error page offers a retry.
  const guide = await getWeekGuide(week);
  const trimester = trimesterOf(week);

  return (
    <Container>
      <BackLink />

      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">Your 9-Month Journey</p>
          <p className="mt-1 text-muted">Week by week guide for a healthy pregnancy.</p>
        </div>
        <nav aria-label="Trimesters" className="flex flex-wrap gap-2">
          {([1, 2, 3] as const).map((t) => (
            <Link
              key={t}
              href={`/weeks/${TRIMESTER_WEEKS[t][0]}`}
              aria-current={t === trimester ? "true" : undefined}
              className={cx(
                "rounded-full border px-4 py-1.5 text-sm font-semibold transition",
                t === trimester
                  ? "border-clay bg-clay text-white shadow-soft"
                  : "border-line bg-card text-slate hover:border-clay/40",
              )}
            >
              Trimester {t}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mt-6 rounded-3xl bg-card/70 px-3 pt-4 shadow-soft sm:px-5">
        <WeekStrip selected={week} basePath="/weeks/" />
      </div>
      <YourWeekNote week={week} />

      {/* This week */}
      <section className="relative mt-6 grid items-center gap-6 overflow-hidden rounded-3xl bg-linear-to-r from-card to-paper-2 p-5 shadow-soft sm:grid-cols-[minmax(0,16rem)_1fr] sm:p-6">
        <LeafBranch flip className="absolute -right-4 -top-4 h-40 w-28 opacity-80" />
        <Image
          src="/assets/illustrations/baby-clean.jpg"
          alt="Illustration of a baby curled up in the womb"
          width={632}
          height={672}
          priority
          sizes="16rem"
          className="mx-auto aspect-square w-56 rounded-3xl object-cover shadow-soft sm:w-full"
        />
        <div className="relative">
          <h1 className="font-sans text-4xl font-extrabold tracking-tight sm:text-5xl">Week {week}</h1>
          <p className="mt-1 text-xl font-bold text-clay-strong">{TRIMESTER_NAMES[trimester]}</p>
          {guide ? (
            <>
              {guide.title !== `Week ${week}` && <p className="mt-4 text-lg font-bold text-slate">{guide.title}</p>}
              <p className="mt-2 max-w-xl text-lg leading-relaxed text-muted">{guide.summary}</p>
            </>
          ) : (
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
              This week&apos;s guide isn&apos;t published yet. Each guide is reviewed by a
              clinician before we publish it. Try another week, or{" "}
              <Link href="/articles" className="font-semibold text-clay-strong underline">
                read our articles
              </Link>{" "}
              in the meantime.
            </p>
          )}
        </div>
      </section>

      {guide ? (
        <>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <section className={card}>
              <h2 className="font-sans text-lg font-bold">Baby Development</h2>
              <p className="mt-3 flex gap-3 leading-relaxed">
                <CircleCheck className="mt-0.5 size-5 shrink-0 fill-sage-bright text-white" aria-hidden />
                <span>{guide.sections.baby}</span>
              </p>
            </section>
            <section className={card}>
              <h2 className="font-sans text-lg font-bold">Mother&apos;s Wellbeing</h2>
              <p className="mt-3 leading-relaxed text-muted">{guide.sections.body}</p>
              {guide.sections.symptoms.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {guide.sections.symptoms.map((code) => (
                    <li key={code} className="rounded-full bg-plum-soft px-3 py-1 text-xs font-semibold text-plum">
                      {SYMPTOMS[code as SymptomCode] ?? code.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="mt-8" aria-labelledby="full-guide">
            <h2 id="full-guide" className="mb-4 font-sans text-xl font-bold">
              Everything for week {week}
            </h2>
            <WeekGuideView guide={guide} />
          </section>
        </>
      ) : null}

      <nav aria-label="Week" className="mt-8 flex flex-wrap items-center justify-center gap-4">
        {week > 1 && (
          <Link
            href={`/weeks/${week - 1}`}
            className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-muted hover:text-clay-strong"
          >
            <ChevronLeft className="size-4" aria-hidden /> Week {week - 1}
          </Link>
        )}
        {week < 42 && (
          <ButtonLink
            href={`/weeks/${week + 1}`}
            className="min-h-12 min-w-64 bg-linear-to-b from-clay to-clay-strong px-8 shadow-[0_12px_24px_-12px_rgb(208_50_95/0.7)]"
          >
            Next: Week {week + 1} <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        )}
      </nav>
    </Container>
  );
}
