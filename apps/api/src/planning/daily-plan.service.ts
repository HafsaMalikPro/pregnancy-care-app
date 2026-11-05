import { Injectable, NotFoundException } from '@nestjs/common';
import type { DailyPlan, DailyPlanDay } from '@preconception/contracts';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { addDays, fromIsoDate, toIsoDate } from '../common/dates.js';
import {
  inWeekWindow,
  PregnancyContext,
  weekOn,
} from '../common/pregnancy-context.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { dateAtGestation } from '../pregnancy/dating.js';
import {
  ruleWeekdays,
  wallTime,
  zonedToInstant,
} from '../reminders/schedule.js';
import { buildDay, type DayInputs } from './daily-plan.js';
import { PersonalPlansService } from './personal-plans.service.js';

const REMINDER_TITLES: Record<string, string> = {
  daily_log: 'Daily check-in',
  period_expected: 'Period reminder',
  readiness_checkin: 'Checklist check-in',
  custom: 'Reminder',
};
const MAX_ACTIVITIES = 2;
const MAX_CHECKLIST = 3;

const pad = (n: number) => String(n).padStart(2, '0');
const wallDate = (w: { year: number; month: number; day: number }) =>
  `${w.year}-${pad(w.month)}-${pad(w.day)}`;

/**
 * Aggregates the daily plan from existing records. Nothing is generated or stored when the plan
 * is read; the only plan-owned state is PlanTaskCompletion for tasks with no other record.
 */
@Injectable()
export class DailyPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pregnancy: PregnancyContext,
    private readonly plans: PersonalPlansService,
    private readonly consent: ConsentService,
  ) {}

  async plan(
    owner: Owner,
    opts: { date?: string; days: number; locale: string },
  ): Promise<DailyPlan> {
    const where = ownerWhere(owner);
    const [active, profile] = await Promise.all([
      this.pregnancy.active(owner),
      this.prisma.profile.findFirst({ where, select: { timeZone: true } }),
    ]);
    const zone = profile?.timeZone ?? 'UTC';
    const start = opts.date ?? active?.today ?? (await this.today(zone));
    const end = addDays(start, opts.days - 1);
    const dates = Array.from({ length: opts.days }, (_, i) =>
      addDays(start, i),
    );
    const dueDate = active ? toIsoDate(active.row.dueDate) : null;
    const weekOf = (date: string) =>
      dueDate ? weekOn(dueDate, date).week : null;
    const weekStartOf = (week: number | null) =>
      dueDate && week ? dateAtGestation(dueDate, week * 7) : null;

    const rangeStart = zonedToInstant(wall(start), zone);
    const rangeEnd = zonedToInstant(wall(addDays(end, 1)), zone);
    const weekStarts = [
      ...new Set(
        dates
          .map((d) => weekStartOf(weekOf(d)))
          .filter((x): x is string => !!x),
      ),
    ];

    const [
      logs,
      completions,
      tasks,
      progress,
      appointments,
      reminders,
      mealPlan,
      exercise,
      activityLogs,
    ] = await Promise.all([
      this.prisma.dailyLog.findMany({
        where: {
          ...where,
          date: { gte: fromIsoDate(start), lte: fromIsoDate(end) },
        },
        select: { date: true, waterGlasses: true },
      }),
      this.prisma.planTaskCompletion.findMany({
        where: { ...where, date: { in: weekStarts.map(fromIsoDate) } },
      }),
      this.prisma.readinessTask.findMany({
        where: { locale: opts.locale, status: 'published', premium: false },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      }),
      this.prisma.userTaskProgress.findMany({
        where,
        select: { taskId: true, completedAt: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          ...where,
          startsAt: { gte: new Date(rangeStart), lt: new Date(rangeEnd) },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.reminder.findMany({
        where: { ...where, enabled: true },
        orderBy: { localTime: 'asc' },
      }),
      active
        ? this.plans.mealPlan(owner, {
            date: start,
            days: opts.days,
            locale: opts.locale,
          })
        : null,
      active
        ? this.plans.exercisePlan(owner, { date: start, locale: opts.locale })
        : null,
      this.prisma.activityLog.findMany({
        where: {
          ...where,
          date: { gte: fromIsoDate(start), lte: fromIsoDate(end) },
        },
        select: { date: true, activitySlug: true },
      }),
    ]);

    const logByDate = new Map(logs.map((l) => [toIsoDate(l.date), l]));
    const completed = new Set(
      completions.map((c) => `${toIsoDate(c.date)}|${c.taskKey}`),
    );
    const doneTask = new Map(
      progress.map((p) => [p.taskId, p.completedAt !== null]),
    );
    const doneActivity = new Set(
      activityLogs.map((a) => `${toIsoDate(a.date)}|${a.activitySlug}`),
    );

    const days: DailyPlanDay[] = dates.map((date) => {
      const week = weekOf(date);
      const weekStart = weekStartOf(week);
      const inputs: DayInputs = {
        date,
        pregnancyWeek: week,
        weekStart,
        guideRead:
          week !== null && completed.has(`${weekStart}|guide:w${week}`),
        journalSaved: logByDate.has(date),
        waterGlasses: logByDate.get(date)?.waterGlasses ?? null,
        meals: (mealPlan?.days.find((d) => d.date === date)?.meals ?? []).map(
          (m) => ({
            slot: m.slot,
            recipeSlug: m.recipe.slug,
            title: m.recipe.title,
            eaten: m.eaten,
          }),
        ),
        activities: (exercise?.activities ?? [])
          .slice(0, MAX_ACTIVITIES)
          .map((a) => ({
            slug: a.slug,
            title: a.title,
            done: doneActivity.has(`${date}|${a.slug}`),
          })),
        checklist: this.checklistFor(tasks, doneTask, week),
        appointments: appointments
          .map((a) => ({ a, w: wallTime(a.startsAt.getTime(), zone) }))
          .filter(({ w }) => wallDate(w) === date)
          .map(({ a, w }) => ({
            id: a.id,
            title: a.title,
            time: `${pad(w.hour)}:${pad(w.minute)}`,
          })),
        reminders: reminders
          .filter((r) =>
            ruleWeekdays(r.recurrence).has(
              new Date(`${date}T00:00:00Z`).getUTCDay(),
            ),
          )
          .map((r) => ({
            id: r.id,
            title: r.label ?? REMINDER_TITLES[r.kind] ?? 'Reminder',
            time: r.localTime,
          })),
      };
      return buildDay(inputs);
    });
    return { days };
  }

  /** Marks or clears a plan-owned task (currently: reading a week's guide). */
  async setTask(
    owner: Owner,
    date: string,
    key: string,
    done: boolean,
    locale: string,
  ): Promise<DailyPlanDay> {
    await this.consent.assertHealthDataConsent(owner);
    const active = await this.pregnancy.active(owner);
    if (!active) throw new NotFoundException('No active pregnancy.');
    const week = Number(key.slice('guide:w'.length));
    const weekStart = dateAtGestation(toIsoDate(active.row.dueDate), week * 7);
    const where = {
      ...ownerWhere(owner),
      date: fromIsoDate(weekStart),
      taskKey: key,
    };
    if (done) {
      const exists = await this.prisma.planTaskCompletion.findFirst({ where });
      if (!exists) {
        await this.prisma.planTaskCompletion.createMany({
          data: [where],
          skipDuplicates: true,
        });
      }
    } else {
      await this.prisma.planTaskCompletion.deleteMany({ where });
    }
    return (await this.plan(owner, { date, days: 1, locale })).days[0];
  }

  private checklistFor(
    tasks: {
      id: string;
      title: string;
      fromWeek: number | null;
      toWeek: number | null;
    }[],
    done: Map<string, boolean>,
    week: number | null,
  ) {
    const windowed =
      week === null
        ? []
        : tasks.filter(
            (t) => inWeekWindow(week, t.fromWeek, t.toWeek) === true,
          );
    const pick = windowed.length
      ? windowed
      : tasks.filter((t) => !done.get(t.id));
    return pick.slice(0, MAX_CHECKLIST).map((t) => ({
      id: t.id,
      title: t.title,
      done: done.get(t.id) ?? false,
    }));
  }

  private async today(zone: string) {
    return wallDate(wallTime(Date.now(), zone));
  }
}

function wall(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day, hour: 0, minute: 0 };
}
