"use client";

import {
  ArrowRight,
  Baby,
  Bell,
  CalendarHeart,
  ChevronRight,
  Circle,
  CircleCheck,
  Dumbbell,
  NotebookPen,
  Utensils,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArticleStrip } from "@/components/article-strip";
import { useSession } from "@/components/session-provider";
import { ButtonLink, Card, ErrorState, Loading, ProgressRing } from "@/components/ui";
import { TRIMESTER_NAMES } from "@/components/week-hero";
import { cx } from "@/lib/cx";
import { ApiRequestError, isNotFound } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { MILESTONES, REMINDER_KINDS, SYMPTOMS, TERM_STATUS } from "@/lib/labels";
import type {
  ArticleSummary,
  DailyLog,
  Page,
  ReadinessTask,
  Reminder,
  ThisWeek,
  Timeline,
} from "@/lib/types";
import { useApi } from "@/lib/use-api";

const FULL_TERM_DAYS = 280;

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const router = useRouter();
  const { me } = useSession();
  const week = useApi<ThisWeek>("/v1/pregnancies/current/week");
  const ready = Boolean(week.data);
  const timeline = useApi<Timeline>(ready ? "/v1/pregnancies/current/timeline" : null);
  const tasks = useApi<ReadinessTask[]>(ready ? "/v1/readiness/tasks" : null);
  const reminders = useApi<Reminder[]>(ready ? "/v1/reminders" : null);
  const articles = useApi<Page<ArticleSummary>>("/v1/articles?limit=4");
  const todayLog = useApi<DailyLog>(week.data ? `/v1/daily-logs/${week.data.pregnancy.today}` : null);

  // No pregnancy yet, or no consent yet: onboarding handles both.
  const needsOnboarding =
    isNotFound(week.error) ||
    (week.error instanceof ApiRequestError && week.error.code === "CONSENT_REQUIRED");
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (week.loading || needsOnboarding) return <Loading />;
  if (week.error) return <ErrorState error={week.error} onRetry={week.reload} />;
  if (!week.data) return null;

  const { pregnancy: p, guide } = week.data;
  const elapsed = p.gestationalAge.weeks * 7 + p.gestationalAge.days;
  const pct = Math.min(100, (elapsed / FULL_TERM_DAYS) * 100);
  const nextMilestone = timeline.data?.milestones.find((m) => m.status !== "past");
  const taskList = tasks.data ?? [];
  const openTasks = taskList.filter((t) => !t.completedAt && !t.locked);
  const activeReminders = (reminders.data ?? []).filter((r) => r.enabled);
  const name = me?.kind === "user" && me.name ? me.name.split(" ")[0] : null;
  // A missing entry is a 404, which just means nothing is logged yet.
  const logged = todayLog.data && !todayLog.error ? todayLog.data : null;

  const nextReminder = activeReminders[0];

  /**
   * Today's plan lists only things the app actually tracks; an item is ticked only when its
   * saved state says so (a logged journal entry, a completed checklist).
   */
  const plan: { key: string; label: string; href: string; done: boolean | null }[] = [
    {
      key: "journal",
      label: logged
        ? `Logged today: ${
            logged.symptoms.length ? logged.symptoms.map((x) => SYMPTOMS[x]).join(", ") : "no symptoms"
          }${logged.note ? ", with a note" : ""}`
        : "Log how you're feeling today",
      href: "/journal",
      done: Boolean(logged),
    },
    {
      key: "guide",
      label: `Read: your week ${p.week} guide`,
      href: `/weeks/${p.week}`,
      done: null,
    },
    ...(taskList.length > 0
      ? [
          openTasks[0]
            ? { key: "task", label: openTasks[0].title, href: "/checklist", done: false }
            : { key: "task", label: "Checklist complete", href: "/checklist", done: true },
        ]
      : []),
    nextReminder
      ? {
          key: "reminder",
          label: `${nextReminder.label ?? REMINDER_KINDS[nextReminder.kind]} at ${nextReminder.localTime}`,
          href: "/reminders",
          done: null,
        }
      : { key: "reminder", label: "Set a daily reminder", href: "/reminders", done: null },
  ];

  const quickActions = [
    { href: "/nutrition", label: "Meal Plan", icon: Utensils, tone: "bg-[#fde6d3] text-[#e8792b]" },
    { href: "/exercise", label: "Exercise Guide", icon: Dumbbell, tone: "bg-[#ece4fb] text-[#7a52d6]" },
    { href: "/baby-care", label: "Baby Care", icon: Baby, tone: "bg-blush text-[#e0457a]" },
    { href: "/journal", label: "Journal", icon: NotebookPen, tone: "bg-[#efe3fb] text-[#9b4fd0]" },
    { href: "/reminders", label: "Reminders", icon: Bell, tone: "bg-[#e3ecfb] text-[#3b6fc4]" },
  ];

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="font-sans text-3xl font-extrabold tracking-tight sm:text-4xl">
          {greeting(new Date().getHours())}
          {name ? `, ${name}` : ""}!
        </h1>
        <p className="mt-1 text-muted">Here&apos;s your pregnancy overview.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        {/* Current week */}
        <section className="relative grid items-center overflow-hidden rounded-3xl bg-linear-to-r from-(--hero-from) via-(--hero-via) via-40% to-(--hero-to) text-white shadow-soft sm:grid-cols-[minmax(0,15rem)_1fr]">
          <Image
            src="/assets/illustrations/baby-clean.jpg"
            alt="Illustration of a baby curled up in the womb"
            width={632}
            height={672}
            priority
            sizes="15rem"
            className="h-48 w-full object-cover sm:h-full [mask-image:linear-gradient(to_right,black_70%,transparent)] max-sm:[mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
          />
          <div className="px-6 pb-6 pt-2 sm:py-7">
            <p className="text-sm font-semibold text-white/90">You&apos;re in</p>
            <h2 className="font-sans text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Week {p.week}
            </h2>
            <p className="mt-1 font-semibold text-white/95">{TRIMESTER_NAMES[p.trimester]}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-white/90">
              <CalendarHeart className="size-4" aria-hidden />
              Due date: {formatDate(p.dueDate, { day: "numeric", month: "short", year: "numeric" })}
            </p>
            {p.week >= 37 && (
              <p className="mt-1 text-sm font-semibold text-white">{TERM_STATUS[p.termStatus]}</p>
            )}
            <div className="mt-4">
              <ButtonLink href="/timeline" variant="secondary" className="border-white bg-white text-(--hero-ink)! hover:bg-white/90">
                View Journey <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Progress */}
        <Card className="flex flex-col items-center justify-center text-center">
          <h2 className="font-sans text-lg font-bold">Pregnancy Progress</h2>
          <div className="mt-4">
            <ProgressRing value={pct} label={`${Math.round(pct)} percent of the way to your due date`}>
              <span className="font-sans text-2xl font-extrabold text-heading">{Math.round(pct)}%</span>
            </ProgressRing>
          </div>
          <p className="mt-4 font-bold text-slate">Week {p.week} of 40</p>
          <p className="text-sm text-muted">
            {p.daysUntilDue > 0
              ? `${p.daysUntilDue} days to go`
              : p.daysUntilDue === 0
                ? "Your due date is today"
                : `${-p.daysUntilDue} days past your due date`}
          </p>
          {nextMilestone && (
            <p className="mt-3 rounded-full bg-sunk px-3 py-1 text-xs font-semibold text-muted">
              Next: {MILESTONES[nextMilestone.key]}, {formatDate(nextMilestone.date, { day: "numeric", month: "short" })}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Today's plan */}
        <Card className="flex flex-col">
          <h2 className="font-sans text-lg font-bold">Today&apos;s Plan</h2>
          <ul className="mt-3 grid gap-1">
            {plan.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2 text-sm hover:bg-sunk"
                >
                  {item.done === true ? (
                    <CircleCheck className="size-5 shrink-0 fill-sage-bright text-white" aria-label="Done" />
                  ) : item.done === false ? (
                    <Circle className="size-5 shrink-0 text-line" aria-label="Not done yet" />
                  ) : (
                    <ChevronRight className="size-5 shrink-0 text-clay-strong" aria-hidden />
                  )}
                  <span className={cx("flex-1", item.done ? "text-muted" : "text-ink")}>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/tools"
            className="mt-auto inline-flex items-center justify-center gap-1 pt-3 text-sm font-bold text-clay-strong hover:underline"
          >
            View Full Plan <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>

        {/* Baby this week */}
        <Card className="flex flex-col items-center text-center">
          <h2 className="self-start font-sans text-lg font-bold">Your Baby This Week</h2>
          <Image
            src="/assets/illustrations/baby-clean.jpg"
            alt=""
            width={632}
            height={672}
            sizes="8rem"
            className="mt-3 size-32 rounded-full object-cover shadow-[0_0_0_6px_rgb(255_255_255/0.7),0_12px_24px_-12px_rgb(169_61_89/0.5)]"
          />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            {guide?.summary ?? `The week ${p.week} guide is still being reviewed by our clinical team.`}
          </p>
          <ButtonLink
            href={`/weeks/${p.week}`}
            variant="secondary"
            className="mt-4 border-transparent bg-clay-soft text-clay-strong"
          >
            Explore Details <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </Card>
      </div>

      {/* Quick actions */}
      <section aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="font-sans text-lg font-bold">
          Quick Actions
        </h2>
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {quickActions.map(({ href, label, icon: Icon, tone }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full flex-col items-center gap-2 rounded-3xl border border-white/80 bg-card px-2 py-4 text-center text-xs font-bold text-slate shadow-soft transition hover:-translate-y-0.5 hover:border-clay/30"
              >
                <span aria-hidden className={cx("grid size-11 place-items-center rounded-2xl", tone)}>
                  <Icon className="size-5" strokeWidth={2.2} />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {articles.data && articles.data.items.length > 0 && <ArticleStrip articles={articles.data.items} />}
    </div>
  );
}
