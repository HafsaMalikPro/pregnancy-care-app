import type {
  DatingInput,
  GestationalAge,
  TermStatus,
} from '@preconception/contracts';
import { daysBetween } from '@preconception/utils';
import { addDays } from '../common/dates.js';

/** 40 weeks from the first day of the last menstrual period (ACOG). */
export const PREGNANCY_DAYS = 280;
/** Conception to due date for IVF dating: 280 - 14. */
const CONCEPTION_TO_DUE = 266;
/** Gestational ages the app accepts for an active pregnancy: up to 44w0d. */
export const MAX_GESTATION_DAYS = 44 * 7;
export const MAX_WEEK = 42;

// Gestational-age boundaries in days (ACOG trimesters and CO 579 term definitions).
const SECOND_TRIMESTER = 14 * 7;
const THIRD_TRIMESTER = 28 * 7;
const EARLY_TERM = 37 * 7;
const FULL_TERM = 39 * 7;
const LATE_TERM = 41 * 7;
const POSTTERM = 42 * 7;

/**
 * Estimated due date from one dating method. Pure: no clock, dates as YYYY-MM-DD.
 * - lmp: LMP + 280 days, shifted by (cycle length - 28) when given (NHS calculator adjusts
 *   for cycle length).
 * - ultrasound: scan date + (280 - gestational age at the scan).
 * - ivf: transfer date + (266 - embryo age in days) (ACOG: from embryo age and transfer date).
 */
export function dueDateFrom(input: DatingInput): string {
  switch (input.method) {
    case 'lmp':
      return addDays(
        input.lmpDate,
        PREGNANCY_DAYS + ((input.cycleLengthDays ?? 28) - 28),
      );
    case 'due_date':
      return input.dueDate;
    case 'ultrasound':
      return addDays(
        input.scanDate,
        PREGNANCY_DAYS - (input.gestationalWeeks * 7 + input.gestationalDays),
      );
    case 'ivf':
      return addDays(
        input.transferDate,
        CONCEPTION_TO_DUE - input.embryoAgeDays,
      );
  }
}

/** Days of gestation on `date` for a pregnancy due on `dueDate`. May be negative. */
export function gestationDays(dueDate: string, date: string): number {
  return PREGNANCY_DAYS - daysBetween(date, dueDate);
}

export function toGestationalAge(days: number): GestationalAge {
  const d = Math.max(0, days);
  return { weeks: Math.floor(d / 7), days: d % 7 };
}

/** The date on which gestation reaches `days` for a pregnancy due on `dueDate`. */
export function dateAtGestation(dueDate: string, days: number): string {
  return addDays(dueDate, days - PREGNANCY_DAYS);
}

/** ACOG: first trimester to 13w6d, second 14w0d-27w6d, third from 28w0d. */
export function trimesterFor(days: number): 1 | 2 | 3 {
  if (days < SECOND_TRIMESTER) return 1;
  if (days < THIRD_TRIMESTER) return 2;
  return 3;
}

/** ACOG CO 579: early term 37w0d, full term 39w0d, late term 41w0d, postterm 42w0d. */
export function termStatusFor(days: number): TermStatus {
  if (days < EARLY_TERM) return 'preterm';
  if (days < FULL_TERM) return 'early_term';
  if (days < LATE_TERM) return 'full_term';
  if (days < POSTTERM) return 'late_term';
  return 'postterm';
}

/** Week-guide week: completed weeks, clamped to 1-42 (12w3d reads the week 12 guide). */
export function guideWeekFor(days: number): number {
  return Math.min(MAX_WEEK, Math.max(1, Math.floor(days / 7)));
}

export interface DatingProblem {
  path: string;
  message: string;
}

/**
 * Checks that an estimate describes a plausible, current pregnancy on `today`:
 * input dates not in the future, and gestation today between 0 and 44 weeks.
 */
export function datingProblems(
  input: DatingInput,
  today: string,
): DatingProblem[] {
  const problems: DatingProblem[] = [];
  const inputDate =
    input.method === 'lmp'
      ? ['lmpDate', input.lmpDate]
      : input.method === 'ultrasound'
        ? ['scanDate', input.scanDate]
        : input.method === 'ivf'
          ? ['transferDate', input.transferDate]
          : null;
  if (inputDate && inputDate[1] > today) {
    problems.push({
      path: inputDate[0],
      message: `${inputDate[0]} cannot be in the future`,
    });
  }
  const days = gestationDays(dueDateFrom(input), today);
  if (days < 0) {
    problems.push({
      path: input.method === 'due_date' ? 'dueDate' : 'method',
      message:
        'This due date is more than 40 weeks away; please check the dates',
    });
  } else if (days > MAX_GESTATION_DAYS) {
    problems.push({
      path: input.method === 'due_date' ? 'dueDate' : 'method',
      message:
        'This would be more than 44 weeks of pregnancy; please check the dates',
    });
  }
  return problems;
}

export interface MilestoneDef {
  key:
    | 'second_trimester'
    | 'third_trimester'
    | 'early_term'
    | 'full_term'
    | 'due_date'
    | 'late_term'
    | 'postterm';
  days: number;
}

export const MILESTONES: MilestoneDef[] = [
  { key: 'second_trimester', days: SECOND_TRIMESTER },
  { key: 'third_trimester', days: THIRD_TRIMESTER },
  { key: 'early_term', days: EARLY_TERM },
  { key: 'full_term', days: FULL_TERM },
  { key: 'due_date', days: PREGNANCY_DAYS },
  { key: 'late_term', days: LATE_TERM },
  { key: 'postterm', days: POSTTERM },
];

/** Weeks 1-42 with their date ranges and trimester, and the milestones, for a due date. */
export function timelineFor(dueDate: string, today: string) {
  const weeks = Array.from({ length: MAX_WEEK }, (_, i) => {
    const week = i + 1;
    return {
      week,
      startDate: dateAtGestation(dueDate, week * 7),
      endDate: dateAtGestation(dueDate, week * 7 + 6),
      trimester: trimesterFor(week * 7),
    };
  });
  const milestones = MILESTONES.map((m) => {
    const date = dateAtGestation(dueDate, m.days);
    return {
      key: m.key,
      date,
      gestationalAge: toGestationalAge(m.days),
      status: (date < today
        ? 'past'
        : date === today
          ? 'today'
          : 'upcoming') as 'past' | 'today' | 'upcoming',
    };
  });
  return { dueDate, today, weeks, milestones };
}
