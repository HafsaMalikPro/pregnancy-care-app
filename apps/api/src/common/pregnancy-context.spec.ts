import { describe, expect, it } from 'vitest';
import { dateAtGestation } from '../pregnancy/dating.js';
import { inWeekWindow, weekOn } from './pregnancy-context.js';

describe('weekOn', () => {
  // A due date whose pregnancy spans 29 February 2028.
  for (const dueDate of ['2026-12-01', '2028-06-15']) {
    it(`gives every week 1-42 on its first and last day (due ${dueDate})`, () => {
      for (let week = 1; week <= 42; week++) {
        const first = dateAtGestation(dueDate, week * 7);
        const last = dateAtGestation(dueDate, week * 7 + 6);
        expect(weekOn(dueDate, first).week).toBe(week);
        expect(weekOn(dueDate, last).week).toBe(week);
      }
    });
  }

  it('switches trimester exactly at 14w0d and 28w0d', () => {
    const due = '2026-12-01';
    expect(weekOn(due, dateAtGestation(due, 13 * 7 + 6)).trimester).toBe(1);
    expect(weekOn(due, dateAtGestation(due, 14 * 7)).trimester).toBe(2);
    expect(weekOn(due, dateAtGestation(due, 27 * 7 + 6)).trimester).toBe(2);
    expect(weekOn(due, dateAtGestation(due, 28 * 7)).trimester).toBe(3);
  });

  it('clamps before week 1 and after week 42', () => {
    const due = '2026-12-01';
    expect(weekOn(due, dateAtGestation(due, 2)).week).toBe(1);
    expect(weekOn(due, dateAtGestation(due, 44 * 7)).week).toBe(42);
  });
});

describe('inWeekWindow', () => {
  it('is null for an open window and inclusive at both ends', () => {
    expect(inWeekWindow(20, null, null)).toBeNull();
    expect(inWeekWindow(20, 20, 30)).toBe(true);
    expect(inWeekWindow(30, 20, 30)).toBe(true);
    expect(inWeekWindow(31, 20, 30)).toBe(false);
    expect(inWeekWindow(5, null, 10)).toBe(true);
    expect(inWeekWindow(5, 10, null)).toBe(false);
  });
});
