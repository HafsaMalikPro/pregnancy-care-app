"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  cx,
} from "@/components/ui";
import { WeekGuideView } from "@/components/week-guide";
import { TRIMESTER_NAMES, WeekHero } from "@/components/week-hero";
import { WeekStrip } from "@/components/week-strip";
import { isNotFound } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { MILESTONES } from "@/lib/labels";
import type { Pregnancy, Timeline, WeekGuide } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function TimelinePage() {
  return (
    <Suspense fallback={<Loading />}>
      <MyPregnancy />
    </Suspense>
  );
}

function MyPregnancy() {
  const params = useSearchParams();
  const pregnancy = useApi<Pregnancy>("/v1/pregnancies/current");
  const timeline = useApi<Timeline>(pregnancy.data ? "/v1/pregnancies/current/timeline" : null);

  if (pregnancy.loading) return <Loading />;
  if (isNotFound(pregnancy.error)) {
    return (
      <EmptyState title="Add your pregnancy to see your timeline">
        <ButtonLink href="/onboarding" className="mt-4">
          Add my due date
        </ButtonLink>
      </EmptyState>
    );
  }
  if (pregnancy.error) return <ErrorState error={pregnancy.error} onRetry={pregnancy.reload} />;
  const p = pregnancy.data;
  if (!p) return null;

  const requested = Number(params.get("week"));
  const week = Number.isInteger(requested) && requested >= 1 && requested <= 42 ? requested : p.week;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="My pregnancy"
        subtitle={`Due ${formatDate(p.dueDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />
      <div>
        <WeekStrip selected={week} current={p.week} basePath="/timeline?week=" />
        <SelectedWeek week={week} pregnancy={p} />
      </div>

      {timeline.error ? (
        <ErrorState error={timeline.error} onRetry={timeline.reload} />
      ) : (
        timeline.data && <Overview timeline={timeline.data} current={p.week} />
      )}
    </div>
  );
}

function SelectedWeek({ week, pregnancy: p }: { week: number; pregnancy: Pregnancy }) {
  const guide = useApi<WeekGuide>(`/v1/week-guides/${week}`);
  const isCurrent = week === p.week;

  return (
    <div className="grid gap-6">
      <WeekHero
        week={week}
        title={guide.data?.week === week ? guide.data.title : undefined}
        summary={guide.data?.week === week ? guide.data.summary : undefined}
        badge={
          isCurrent ? (
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
              Current week
            </span>
          ) : (
            <Link href="/timeline" scroll={false} className="text-sm font-semibold text-white underline">
              Back to my current week ({p.week})
            </Link>
          )
        }
      />
      {guide.loading ? (
        <Loading />
      ) : isNotFound(guide.error) ? (
        <EmptyState title={`The week ${week} guide isn't published yet`}>
          Each guide is reviewed by a clinician before we publish it.
        </EmptyState>
      ) : guide.error ? (
        <ErrorState error={guide.error} onRetry={guide.reload} />
      ) : (
        guide.data && (
          <WeekGuideView
            guide={guide.data}
            firstPregnancy={p.firstPregnancy}
            restrictExercise={p.restrictExercise}
          />
        )
      )}
      <nav aria-label="Week" className="flex justify-between gap-3">
        <ButtonLink
          href={`/timeline?week=${week - 1}`}
          scroll={false}
          variant="secondary"
          aria-disabled={week <= 1}
          className={cx(week <= 1 && "pointer-events-none opacity-40")}
          tabIndex={week <= 1 ? -1 : undefined}
        >
          <ChevronLeft className="size-4" aria-hidden /> Previous week
        </ButtonLink>
        {week < 42 ? (
          <ButtonLink href={`/timeline?week=${week + 1}`} scroll={false}>
            Next week <ChevronRight className="size-4" aria-hidden />
          </ButtonLink>
        ) : (
          <Button disabled>Next week</Button>
        )}
      </nav>
    </div>
  );
}

function Overview({ timeline: t, current }: { timeline: Timeline; current: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <h2 className="font-sans text-2xl font-bold">All weeks</h2>
        <div className="mt-4 grid gap-6">
          {([1, 2, 3] as const).map((tri) => (
            <section key={tri}>
              <h3 className="mb-2 text-sm font-bold text-heading">{TRIMESTER_NAMES[tri]}</h3>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {t.weeks
                  .filter((w) => w.trimester === tri)
                  .map((w) => {
                    const isCurrent = w.week === current;
                    const isPast = w.endDate < t.today;
                    return (
                      <li key={w.week}>
                        <Link
                          href={`/timeline?week=${w.week}`}
                          aria-current={isCurrent ? "date" : undefined}
                          className={cx(
                            "block rounded-2xl border px-3 py-2 transition hover:border-clay",
                            isCurrent
                              ? "border-clay bg-clay-soft"
                              : isPast
                                ? "border-line bg-sunk text-muted"
                                : "border-line bg-card",
                          )}
                        >
                          <span className="block text-sm font-semibold">
                            Week {w.week}
                            {isCurrent && <span className="text-clay-strong">, now</span>}
                          </span>
                          <span className="block text-xs text-muted">
                            {formatDate(w.startDate, { day: "numeric", month: "short" })} to{" "}
                            {formatDate(w.endDate, { day: "numeric", month: "short" })}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ol>
            </section>
          ))}
        </div>
      </Card>

      <aside>
        <Card className="lg:sticky lg:top-6">
          <h2 className="font-sans text-xl font-bold">Milestones</h2>
          <ol className="mt-4 grid gap-4">
            {t.milestones.map((m) => (
              <li key={m.key} className="flex gap-3">
                <span
                  aria-hidden
                  className={cx(
                    "mt-1.5 size-3 shrink-0 rounded-full border-2",
                    m.status === "past"
                      ? "border-sage-bright bg-sage-bright"
                      : m.status === "today"
                        ? "border-clay bg-clay"
                        : "border-line bg-card",
                  )}
                />
                <div>
                  <p className={cx("font-semibold", m.status === "past" ? "text-muted" : "text-heading")}>
                    {MILESTONES[m.key]}
                    {m.status === "past" && <span className="sr-only"> (passed)</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {formatDate(m.date)}, {m.gestationalAge.weeks}w {m.gestationalAge.days}d
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </aside>
    </div>
  );
}
