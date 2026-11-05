import type {
  DailyPlanDay,
  MealSlot,
  PlanTask,
} from '@preconception/contracts';

/**
 * Builds one day of the daily plan from records that already exist. Pure: no I/O, no clock.
 * Task keys are derived from the date and the record they point at, so asking for the same day
 * again yields the same tasks (no duplicates), and `done` comes only from saved records.
 */

export interface DayInputs {
  date: string;
  pregnancyWeek: number | null;
  /** The pregnancy week's first day (the guide task is per week, not per day). */
  weekStart: string | null;
  guideRead: boolean;
  journalSaved: boolean;
  waterGlasses: number | null;
  meals: {
    slot: MealSlot;
    recipeSlug: string;
    title: string;
    eaten: boolean;
  }[];
  activities: { slug: string; title: string; done: boolean }[];
  checklist: { id: string; title: string; done: boolean }[];
  appointments: { id: string; title: string; time: string }[];
  reminders: { id: string; title: string; time: string }[];
}

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export function buildDay(d: DayInputs): DailyPlanDay {
  const tasks: PlanTask[] = [];
  const add = (
    t: Omit<PlanTask, 'completable' | 'ref' | 'time'> & Partial<PlanTask>,
  ) => tasks.push({ completable: true, ref: null, time: null, ...t });

  if (d.pregnancyWeek !== null) {
    add({
      key: `guide:w${d.pregnancyWeek}`,
      source: 'plan',
      title: `Read your week ${d.pregnancyWeek} guide`,
      done: d.guideRead,
      ref: String(d.pregnancyWeek),
    });
  }
  add({
    key: `journal:${d.date}`,
    source: 'journal',
    title: 'Log how you are feeling',
    done: d.journalSaved,
  });
  add({
    key: `hydration:${d.date}`,
    source: 'hydration',
    title: 'Note what you have had to drink',
    done: d.waterGlasses !== null && d.waterGlasses > 0,
  });
  for (const m of d.meals) {
    add({
      key: `meal:${d.date}:${m.slot}:${m.recipeSlug}`,
      source: 'meal',
      title: `${SLOT_LABEL[m.slot]}: ${m.title}`,
      done: m.eaten,
      ref: m.recipeSlug,
    });
  }
  for (const a of d.activities) {
    add({
      key: `activity:${d.date}:${a.slug}`,
      source: 'activity',
      title: a.title,
      done: a.done,
      ref: a.slug,
    });
  }
  for (const c of d.checklist) {
    add({
      key: `checklist:${c.id}`,
      source: 'checklist',
      title: c.title,
      done: c.done,
      ref: c.id,
    });
  }
  for (const a of d.appointments) {
    add({
      key: `appointment:${a.id}`,
      source: 'appointment',
      title: a.title,
      done: false,
      completable: false,
      ref: a.id,
      time: a.time,
    });
  }
  for (const r of d.reminders) {
    add({
      key: `reminder:${r.id}:${d.date}`,
      source: 'reminder',
      title: r.title,
      done: false,
      completable: false,
      ref: r.id,
      time: r.time,
    });
  }

  const completable = tasks.filter((t) => t.completable);
  return {
    date: d.date,
    pregnancyWeek: d.pregnancyWeek,
    tasks,
    done: completable.filter((t) => t.done).length,
    total: completable.length,
  };
}
