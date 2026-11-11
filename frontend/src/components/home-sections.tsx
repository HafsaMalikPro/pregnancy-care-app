"use client";

import {
  Apple,
  ArrowRight,
  Baby,
  CalendarHeart,
  ChevronDown,
  CircleCheck,
  Dumbbell,
  HeartHandshake,
  Phone,
  ShieldCheck,
  Sprout,
  Stethoscope,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LeafBranch } from "@/components/decor";
import { CountUp, StaggerItem, StaggerList } from "@/components/motion";
import { cx } from "@/lib/cx";

/*
 * Home page sections below the trimester strip: a topic hub, why the guidance can be trusted
 * (with live content counts), when to get help, common questions and a support band.
 * Medical wording is general and points to a midwife or doctor; it never replaces them.
 */

type Hub = {
  icon: typeof Apple;
  tone: string;
  title: string;
  text: string;
  href: string;
  links: { label: string; href: string }[];
};

const HUBS: Hub[] = [
  {
    icon: Sprout,
    tone: "bg-sage-soft text-sage",
    title: "Early pregnancy",
    text: "What to do first: vitamins, your first appointment and coping with sickness.",
    href: "/journey",
    links: [
      { label: "Folic acid: why it matters", href: "/articles/folic-acid-why-it-matters" },
      { label: "First trimester tests", href: "/articles/first-trimester-tests" },
      { label: "Easing morning sickness", href: "/articles/morning-sickness-relief" },
    ],
  },
  {
    icon: CalendarHeart,
    tone: "bg-blush text-clay-strong",
    title: "Week by week",
    text: "How your baby grows and how your body changes, for every week up to 42.",
    href: "/weeks",
    links: [
      { label: "Week 12", href: "/weeks/12" },
      { label: "Week 20", href: "/weeks/20" },
      { label: "Week 36", href: "/weeks/36" },
    ],
  },
  {
    icon: Apple,
    tone: "bg-[#fde6d3] text-[#b4531a]",
    title: "Nutrition",
    text: "Eating well, foods to be careful with, recipes and meal plans.",
    href: "/nutrition",
    links: [
      { label: "Eating well in pregnancy", href: "/articles/eating-well-in-pregnancy" },
      { label: "Foods to be careful with", href: "/nutrition" },
    ],
  },
  {
    icon: Dumbbell,
    tone: "bg-lavender-soft text-lavender",
    title: "Exercise",
    text: "Gentle, safe movement for each trimester, and when to stop.",
    href: "/exercise",
    links: [
      { label: "Safe exercise during pregnancy", href: "/articles/safe-exercise-pregnancy" },
      { label: "Staying active, trimester by trimester", href: "/articles/staying-active-trimester-by-trimester" },
    ],
  },
  {
    icon: HeartHandshake,
    tone: "bg-blush text-clay-strong",
    title: "Birth and after",
    text: "Recovering after the birth, your mood, and signs that need a check.",
    href: "/birth-and-postpartum",
    links: [
      { label: "Recovering after the birth", href: "/articles/recovering-after-birth" },
      { label: "Your mood after the birth", href: "/articles/postnatal-mental-health" },
      { label: "Warning signs after the birth", href: "/articles/warning-signs-after-birth" },
    ],
  },
  {
    icon: Baby,
    tone: "bg-[#e3ecfb] text-[#2f5fa8]",
    title: "Baby care",
    text: "Feeding, sleeping safely and your newborn's first days at home.",
    href: "/baby-care",
    links: [
      { label: "Your newborn's first week", href: "/articles/newborn-first-week" },
      { label: "Safe sleep for babies", href: "/articles/safe-sleep-for-babies" },
      { label: "Breastfeeding: getting started", href: "/articles/breastfeeding-getting-started" },
    ],
  },
];

/** Six topic hubs, each with direct links into the guidance. Cards reveal as they scroll in. */
export function TopicHub() {
  return (
    <section aria-labelledby="topics-heading" className="py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="topics-heading" className="font-sans text-2xl font-extrabold sm:text-3xl">
            Find what you need
          </h2>
          <p className="mt-1 max-w-xl text-muted">
            Guidance for each stage, from your first weeks to your baby&apos;s first days.
          </p>
        </div>
        <Link href="/articles" className="inline-flex items-center gap-1 text-sm font-bold text-clay-strong hover:underline">
          Browse all articles <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <StaggerList className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {HUBS.map(({ icon: Icon, tone, title, text, href, links }) => (
          <StaggerItem
            key={title}
            className="group relative flex flex-col rounded-3xl border border-white/80 bg-card p-6 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift"
          >
            <span
              aria-hidden
              className={cx(
                "grid size-12 place-items-center rounded-2xl transition duration-300 group-hover:-rotate-6 group-hover:scale-110",
                tone,
              )}
            >
              <Icon className="size-6" strokeWidth={2.1} />
            </span>
            <h3 className="mt-4 font-sans text-lg font-bold">
              <Link href={href} className="hover:text-clay-strong">
                {title}
              </Link>
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
            <ul className="mt-4 grid gap-1 border-t border-line/70 pt-3">
              {links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-ink transition hover:bg-blush hover:text-clay-strong"
                  >
                    {l.label}
                    <ArrowRight className="size-4 shrink-0 opacity-60" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            {/* A rose line grows along the bottom edge on hover. */}
            <span
              aria-hidden
              className="absolute inset-x-6 bottom-0 h-1 origin-left scale-x-0 rounded-full bg-linear-to-r from-rose to-clay transition duration-300 group-hover:scale-x-100"
            />
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

const PILLARS = [
  {
    icon: Stethoscope,
    title: "Clinically reviewed",
    text: "Every article and week guide is checked by a clinical reviewer before it's published.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Your health details stay yours. Download or delete everything at any time.",
  },
  {
    icon: CalendarHeart,
    title: "Built around your due date",
    text: "Guidance follows your week of pregnancy, through to your baby's first weeks.",
  },
] as const;

/** Why the guidance can be trusted, with live counts of published content. */
export function TrustBand({
  stats,
}: {
  stats: { weekGuides: number | null; articles: number | null; recipes: number | null; activities: number | null };
}) {
  const counts = [
    { value: stats.weekGuides, label: "weekly guides" },
    { value: stats.articles, label: "reviewed articles" },
    { value: stats.recipes, label: "pregnancy-safe recipes" },
    { value: stats.activities, label: "gentle activities" },
  ].filter((c): c is { value: number; label: string } => typeof c.value === "number" && c.value > 0);

  return (
    <section
      aria-labelledby="trust-heading"
      className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-blush via-paper-2 to-card px-6 py-10 shadow-soft sm:px-10"
    >
      <LeafBranch className="absolute -bottom-8 -left-4 h-40 w-28 opacity-80" />
      <LeafBranch flip className="absolute -bottom-8 -right-4 h-40 w-28 opacity-80" />
      <h2 id="trust-heading" className="text-center font-sans text-2xl font-extrabold sm:text-3xl">
        Trusted guidance for a healthy pregnancy
      </h2>

      <StaggerList className="relative mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
        {PILLARS.map(({ icon: Icon, title, text }) => (
          <StaggerItem key={title} className="rounded-3xl bg-card/90 p-6 text-center shadow-soft">
            <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-sage-soft text-sage">
              <Icon className="size-6" />
            </span>
            <h3 className="mt-3 font-sans text-base font-bold">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
          </StaggerItem>
        ))}
      </StaggerList>

      {counts.length > 0 && (
        <dl className="relative mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
          {counts.map((c) => (
            <div key={c.label} className="text-center">
              <dt className="sr-only">{c.label}</dt>
              <dd>
                <CountUp value={c.value} className="block font-sans text-3xl font-extrabold text-clay-strong sm:text-4xl" />
                <span className="mt-1 block text-sm text-muted" aria-hidden>
                  {c.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

const URGENT_SIGNS = [
  "Bleeding from the vagina",
  "Your baby moving less than usual, or a change in their pattern of movements",
  "Fluid leaking from the vagina",
  "A severe headache, problems with your vision, or sudden swelling of your face, hands or feet",
  "Severe or ongoing tummy pain",
  "A temperature of 37.8°C or above",
];

/** Signs that need a call to the midwife or maternity unit now. Never animated. */
export function UrgentHelp() {
  return (
    <section
      id="when-to-get-help"
      aria-labelledby="urgent-heading"
      data-no-transition
      className="grid gap-6 rounded-[2rem] border border-danger/20 bg-danger-soft p-6 sm:p-8 lg:grid-cols-[1fr_1.4fr] lg:items-center"
    >
      <div>
        <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-card text-danger shadow-soft">
          <Phone className="size-6" />
        </span>
        <h2 id="urgent-heading" className="mt-4 font-sans text-2xl font-extrabold sm:text-3xl">
          When to get help straight away
        </h2>
        <p className="mt-2 max-w-md text-ink">
          Call your midwife or maternity unit now, at any time of day or night, if you have any of
          these. Don&apos;t wait for your next appointment.
        </p>
        <p className="mt-3 max-w-md font-semibold text-danger">
          If you think you or your baby are in danger, or you feel you might harm yourself, call
          your local emergency number.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {URGENT_SIGNS.map((s) => (
          <li key={s} className="flex items-start gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-ink shadow-soft">
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

const QUESTIONS = [
  {
    q: "How much folic acid should I take?",
    a: "The usual advice is 400 micrograms a day, from before you conceive until 12 weeks of pregnancy. Some people need a higher dose, so ask your GP or midwife.",
    link: { label: "Folic acid: why it matters", href: "/articles/folic-acid-why-it-matters" },
  },
  {
    q: "Is it safe to exercise while I'm pregnant?",
    a: "For most people, yes. Aim for about 150 minutes of moderate activity a week and stop if anything hurts or feels wrong. If you have a health condition or a complication, check with your midwife first.",
    link: { label: "Safe exercise during pregnancy", href: "/articles/safe-exercise-pregnancy" },
  },
  {
    q: "Which foods should I avoid?",
    a: "Alcohol, raw or undercooked meat and eggs, unpasteurised milk and soft mould-ripened cheese, liver, and high-mercury fish such as shark and swordfish. Keep caffeine under 200 mg a day.",
    link: { label: "Nutrition and foods to be careful with", href: "/nutrition" },
  },
  {
    q: "When are the first scans and tests?",
    a: "Most people are offered blood tests at their first (booking) appointment and a dating scan at around 11 to 14 weeks. Timings differ between countries and services.",
    link: { label: "First trimester tests, explained", href: "/articles/first-trimester-tests" },
  },
  {
    q: "My baby is moving less. What should I do?",
    a: "Contact your midwife or maternity unit straight away. Don't wait until the next day, and don't rely on a home heartbeat monitor to reassure you.",
    link: null,
  },
  {
    q: "How can I ease morning sickness?",
    a: "Small, frequent meals, plenty of fluids and rest can help. If you can't keep food or fluids down, contact your GP or midwife, as you may need treatment.",
    link: { label: "Easing morning sickness", href: "/articles/morning-sickness-relief" },
  },
];

/** Common questions with short, general answers. Opens and closes like an accordion. */
export function CommonQuestions() {
  return (
    <section aria-labelledby="faq-heading" className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
      <div>
        <h2 id="faq-heading" className="font-sans text-2xl font-extrabold sm:text-3xl">
          Common questions
        </h2>
        <p className="mt-2 max-w-sm text-muted">
          Short answers to what people ask most. Your midwife or doctor knows your situation
          best, so always follow their advice.
        </p>
      </div>
      <div className="grid gap-3">
        {QUESTIONS.map(({ q, a, link }) => (
          <details
            key={q}
            className="group rounded-2xl border border-white/80 bg-card px-5 shadow-soft open:shadow-lift"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-sans font-bold text-heading [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown
                aria-hidden
                className="size-5 shrink-0 text-clay-strong transition duration-300 group-open:rotate-180"
              />
            </summary>
            <div className="pb-5 text-sm leading-relaxed text-ink">
              <p>{a}</p>
              {link && (
                <Link
                  href={link.href}
                  className="mt-3 inline-flex items-center gap-1 font-bold text-clay-strong hover:underline"
                >
                  {link.label} <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Closing band: support is there, and partners can help too. */
export function SupportBand() {
  return (
    <section
      aria-labelledby="support-heading"
      className="grid items-center gap-8 overflow-hidden rounded-[2rem] bg-linear-to-r from-(--hero-from) via-(--hero-via) to-(--hero-to) p-6 text-white shadow-soft sm:p-10 lg:grid-cols-[1.4fr_1fr]"
    >
      <div>
        <h2 id="support-heading" className="font-sans text-2xl font-extrabold text-white sm:text-3xl">
          You don&apos;t have to do this alone
        </h2>
        <p className="mt-3 max-w-xl text-white/90">
          Talk to your midwife or GP about anything that worries you, however small. Keep track of
          your pregnancy week by week, and share the load with the people around you.
        </p>
        <ul className="mt-4 grid gap-1.5 text-sm text-white/95">
          {["Free to use", "Week-by-week guidance", "Download or delete your data at any time"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CircleCheck className="size-4" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-(--hero-ink) shadow-soft transition hover:bg-white/90"
          >
            Start your journey <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/articles/partner-support-pregnancy"
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/70 px-6 font-semibold text-white transition hover:bg-white/10"
          >
            How partners can help
          </Link>
        </div>
      </div>
      <Image
        src="/assets/articles/photo-relax.jpg"
        alt="A pregnant woman sitting on a bed, smiling down at her bump"
        width={639}
        height={860}
        sizes="(min-width: 1024px) 24rem, 80vw"
        className="mx-auto aspect-square w-full max-w-xs rounded-full object-cover object-[60%_30%] ring-8 ring-white/25"
      />
    </section>
  );
}
