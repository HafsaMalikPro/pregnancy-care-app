"use client";

import {
  Bell,
  BookOpen,
  ChevronRight,
  ListChecks,
  NotebookPen,
  Salad,
} from "lucide-react";
import Link from "next/link";
import { TaskItem } from "@/components/task-item";
import {
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  IconBadge,
  Loading,
  PageHeader,
} from "@/components/ui";
import { formatDate, todayIso } from "@/lib/dates";
import { REMINDER_KINDS, SYMPTOMS } from "@/lib/labels";
import type { DailyLog, Pregnancy, ReadinessTask, Reminder } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function DailyPlanPage() {
  const pregnancy = useApi<Pregnancy>("/v1/pregnancies/current");
  const today = pregnancy.data?.today ?? todayIso();
  const tasks = useApi<ReadinessTask[]>("/v1/readiness/tasks");
  const log = useApi<DailyLog>(pregnancy.data ? `/v1/daily-logs/${today}` : null);
  const reminders = useApi<Reminder[]>("/v1/reminders");

  if (tasks.loading) return <Loading />;
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={tasks.reload} />;
  const list = tasks.data ?? [];
  const open = list.filter((t) => !t.completedAt);
  const loggedToday = log.data && !log.error ? log.data : null;
  const week = pregnancy.data?.week;

  const quick = [
    { href: "/journal", label: "Log symptoms", icon: NotebookPen, tone: "plum" },
    { href: "/reminders", label: "Add a reminder", icon: Bell, tone: "warn" },
    { href: week ? `/timeline?week=${week}` : "/weeks", label: "Nutrition guide", icon: Salad, tone: "sage" },
    { href: "/articles", label: "Read an article", icon: BookOpen, tone: "rose" },
  ] as const;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Daily plan"
        subtitle={formatDate(today, { weekday: "long", day: "numeric", month: "long" })}
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-sans text-2xl font-bold">Your tasks</h2>
            <Link href="/checklist" className="text-sm font-semibold text-clay-strong hover:underline">
              Full checklist
            </Link>
          </div>
          {list.length === 0 ? (
            <EmptyState title="No tasks yet">Checklist tasks appear here once published.</EmptyState>
          ) : open.length === 0 ? (
            <EmptyState title="All done">Every checklist task is complete.</EmptyState>
          ) : (
            <ul className="grid gap-3">
              {open.slice(0, 5).map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onChange={(u) => tasks.setData(list.map((x) => (x.id === u.id ? u : x)))}
                />
              ))}
            </ul>
          )}
        </section>

        <div className="grid content-start gap-6">
          <Card>
            <h2 className="font-sans text-xl font-bold">Quick actions</h2>
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {quick.map(({ href, label, icon: Icon, tone }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="flex h-full flex-col items-center gap-2 rounded-3xl border border-line p-4 text-center text-sm font-semibold hover:border-clay/40"
                  >
                    <IconBadge tone={tone}>
                      <Icon className="size-5" />
                    </IconBadge>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="font-sans text-xl font-bold">Today&apos;s journal</h2>
            <p className="mt-2 text-sm text-muted">
              {loggedToday
                ? `Logged: ${loggedToday.symptoms.length ? loggedToday.symptoms.map((s) => SYMPTOMS[s]).join(", ") : "no symptoms"}.`
                : "Nothing logged yet today."}
            </p>
            <ButtonLink href="/journal" variant="secondary" className="mt-4">
              {loggedToday ? "Edit entry" : "Log today"}
            </ButtonLink>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-xl font-bold">Reminders</h2>
              <Link href="/reminders" className="text-sm font-semibold text-clay-strong hover:underline">
                Manage
              </Link>
            </div>
            <ul className="mt-3 grid gap-2">
              {(reminders.data ?? []).filter((r) => r.enabled).slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>{r.label ?? REMINDER_KINDS[r.kind]}</span>
                  <span className="font-semibold text-heading">{r.localTime}</span>
                </li>
              ))}
              {reminders.data && reminders.data.filter((r) => r.enabled).length === 0 && (
                <li className="text-sm text-muted">No active reminders.</li>
              )}
            </ul>
          </Card>

          <Link href="/checklist" className="flex items-center gap-3 rounded-3xl bg-sage-soft p-4 font-semibold text-sage">
            <ListChecks className="size-5" aria-hidden />
            <span className="flex-1">
              {list.length - open.length} of {list.length} checklist tasks done
            </span>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
