import { CalendarHeart, Flag, Sprout } from "lucide-react";
import type { Metadata } from "next";
import { Container } from "@/components/shell";
import Link from "next/link";
import { WombArt } from "@/components/art";
import { ButtonLink, Card, IconBadge, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Your pregnancy journey",
  description:
    "The three trimesters and the milestones along the way, with a reviewed guide for every week.",
  alternates: { canonical: "/journey" },
};

// Trimester and term boundaries follow ACOG definitions, as the API's timeline does.
const TRIMESTERS = [
  {
    name: "First trimester",
    weeks: [1, 13] as const,
    art: 10,
    text: "From the first day of your last period to the end of week 13. Open any week for its reviewed guide.",
  },
  {
    name: "Second trimester",
    weeks: [14, 27] as const,
    art: 22,
    text: "From week 14 to the end of week 27. Each week's guide covers your baby, your body and your appointments.",
  },
  {
    name: "Third trimester",
    weeks: [28, 42] as const,
    art: 34,
    text: "From week 28 until your baby is born. Term starts at 37 weeks, and the estimated due date is 40 weeks.",
  },
];

const MILESTONES = [
  { week: 14, label: "Second trimester begins" },
  { week: 28, label: "Third trimester begins" },
  { week: 37, label: "Early term" },
  { week: 39, label: "Full term" },
  { week: 40, label: "Estimated due date" },
  { week: 41, label: "Late term" },
];

export default function JourneyPage() {
  return (
    <Container>
      <PageHeader
        title="Your pregnancy journey"
        subtitle="Pregnancy is counted in weeks from the first day of your last period, and usually lasts around 40 weeks. Here's how it's divided."
      />

      <ol className="grid gap-5 lg:grid-cols-3">
        {TRIMESTERS.map((t, i) => (
          <li key={t.name}>
            <Card className="flex h-full flex-col">
              <div className="flex items-center gap-4">
                <WombArt week={t.art} size={96} className="size-24" />
                <div>
                  <p className="text-sm font-semibold text-clay-strong">Stage {i + 1} of 3</p>
                  <h2 className="font-sans text-2xl font-bold">{t.name}</h2>
                  <p className="text-sm text-muted">
                    Weeks {t.weeks[0]}–{t.weeks[1]}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex-1 leading-relaxed">{t.text}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {Array.from({ length: t.weeks[1] - t.weeks[0] + 1 }, (_, k) => t.weeks[0] + k).map((w) => (
                  <Link
                    key={w}
                    href={`/weeks/${w}`}
                    aria-label={`Week ${w}`}
                    className="grid size-9 place-items-center rounded-full border border-line text-sm font-semibold hover:border-clay hover:text-clay-strong"
                  >
                    {w}
                  </Link>
                ))}
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-sans text-3xl font-bold">Milestones along the way</h2>
          <p className="mt-3 max-w-md text-muted">
            When you add your due date, we work out the date of each milestone for you and
            show where you are on your own timeline.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/signup">Start your journey</ButtonLink>
            <ButtonLink href="/weeks" variant="secondary">
              Browse every week
            </ButtonLink>
          </div>
        </div>
        <Card>
          <ol className="relative grid gap-5 before:absolute before:bottom-2 before:left-[1.35rem] before:top-2 before:w-0.5 before:bg-line">
            {MILESTONES.map((m, i) => (
              <li key={m.label} className="relative flex items-center gap-4">
                <IconBadge tone={i === 4 ? "rose" : i < 2 ? "plum" : "sage"} className="relative">
                  {i === 4 ? <CalendarHeart className="size-5" /> : i < 2 ? <Sprout className="size-5" /> : <Flag className="size-5" />}
                </IconBadge>
                <div>
                  <p className="font-semibold text-heading">{m.label}</p>
                  <p className="text-sm text-muted">Week {m.week}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </Container>
  );
}
