import type { Metadata } from "next";
import { Container } from "@/components/shell";
import Link from "next/link";
import { WombArt } from "@/components/art";
import { Alert, PageHeader } from "@/components/ui";
import { TRIMESTER_NAMES, trimesterOf } from "@/components/week-hero";
import { getAllWeekGuides } from "@/lib/public-api";

export const metadata: Metadata = {
  title: "Baby development week by week",
  description:
    "Follow your baby's development through all 42 weeks of pregnancy, with guides reviewed by clinicians.",
  alternates: { canonical: "/weeks" },
};

const WEEKS = Array.from({ length: 42 }, (_, i) => i + 1);

export default async function WeeksPage() {
  const { guides, reachable } = await getAllWeekGuides();

  return (
    <Container>
      <PageHeader
        title="Your baby, week by week"
        subtitle="Pick a week to see how your baby is developing, what's changing for you, and what to ask at appointments."
      />
      {!reachable && (
        <div className="mb-6">
          <Alert tone="warn">
            Weekly guides couldn&apos;t be loaded right now. You can still open any week.
          </Alert>
        </div>
      )}
      {([1, 2, 3] as const).map((tri) => (
        <section key={tri} className="mt-10 first-of-type:mt-0">
          <h2 className="mb-4 font-sans text-2xl font-bold">{TRIMESTER_NAMES[tri]}</h2>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {WEEKS.filter((w) => trimesterOf(w) === tri).map((w) => {
              const guide = guides[w - 1];
              return (
                <li key={w}>
                  <Link
                    href={`/weeks/${w}`}
                    className="flex h-full flex-col items-center rounded-[1.5rem] border border-line/70 bg-card p-3 text-center shadow-soft transition hover:-translate-y-0.5 hover:border-clay/40"
                  >
                    <WombArt week={w} size={88} className="size-20" />
                    <span className="mt-2 font-sans text-lg font-semibold text-heading">
                      Week {w}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted">
                      {guide ? guide.title : "Guide coming soon"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </Container>
  );
}
