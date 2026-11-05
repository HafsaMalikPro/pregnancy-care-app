import { describe, expect, it } from 'vitest';
import { buildDay, type DayInputs } from './daily-plan.js';

const base: DayInputs = {
  date: '2026-11-03',
  pregnancyWeek: 20,
  weekStart: '2026-11-01',
  guideRead: false,
  journalSaved: false,
  waterGlasses: null,
  meals: [],
  activities: [],
  checklist: [],
  appointments: [],
  reminders: [],
};

describe('buildDay', () => {
  it('derives stable keys, so repeated requests produce the same tasks', () => {
    const input: DayInputs = {
      ...base,
      meals: [{ slot: 'lunch', recipeSlug: 'dal', title: 'Dal', eaten: false }],
      checklist: [{ id: 't1', title: 'Pack a bag', done: false }],
    };
    expect(buildDay(input).tasks.map((t) => t.key)).toEqual(
      buildDay(input).tasks.map((t) => t.key),
    );
    expect(new Set(buildDay(input).tasks.map((t) => t.key)).size).toBe(
      buildDay(input).tasks.length,
    );
  });

  it('marks tasks done only from saved state', () => {
    const day = buildDay({
      ...base,
      journalSaved: true,
      waterGlasses: 0,
      meals: [
        { slot: 'dinner', recipeSlug: 'stew', title: 'Stew', eaten: true },
      ],
    });
    const done = Object.fromEntries(day.tasks.map((t) => [t.source, t.done]));
    expect(done).toMatchObject({
      journal: true,
      hydration: false,
      meal: true,
      plan: false,
    });
    expect(day.done).toBe(2);
  });

  it('keeps appointments and reminders informational and out of the totals', () => {
    const day = buildDay({
      ...base,
      appointments: [{ id: 'a', title: 'Scan', time: '10:30' }],
      reminders: [{ id: 'r', title: 'Check-in', time: '20:00' }],
    });
    const info = day.tasks.filter((t) => !t.completable);
    expect(info.map((t) => t.source)).toEqual(['appointment', 'reminder']);
    expect(day.total).toBe(3); // guide, journal, hydration
  });

  it('omits the week guide task without a pregnancy', () => {
    const day = buildDay({ ...base, pregnancyWeek: null, weekStart: null });
    expect(day.tasks.some((t) => t.source === 'plan')).toBe(false);
  });
});
