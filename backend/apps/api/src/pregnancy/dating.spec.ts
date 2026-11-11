import { DatingInput, Timeline } from '@preconception/contracts';
import {
  dateAtGestation,
  datingProblems,
  dueDateFrom,
  gestationDays,
  guideWeekFor,
  termStatusFor,
  timelineFor,
  toGestationalAge,
  trimesterFor,
} from './dating.js';

describe('dueDateFrom', () => {
  it('adds 280 days to the LMP', () => {
    expect(dueDateFrom({ method: 'lmp', lmpDate: '2026-01-01' })).toBe(
      '2026-10-08',
    );
  });

  it.each([
    [28, '2026-10-08'],
    [35, '2026-10-15'],
    [21, '2026-10-01'],
  ])('shifts by cycle length %i', (cycleLengthDays, due) => {
    expect(
      dueDateFrom({ method: 'lmp', lmpDate: '2026-01-01', cycleLengthDays }),
    ).toBe(due);
  });

  it('crosses leap days correctly', () => {
    // 2028 is a leap year: 2027-06-01 + 280 days = 2028-03-07.
    expect(dueDateFrom({ method: 'lmp', lmpDate: '2027-06-01' })).toBe(
      '2028-03-07',
    );
  });

  it('keeps a given due date', () => {
    expect(dueDateFrom({ method: 'due_date', dueDate: '2027-02-14' })).toBe(
      '2027-02-14',
    );
  });

  it('dates from an ultrasound gestational age', () => {
    // Scan at 12w0d on 2026-04-01: 280 - 84 = 196 days later.
    const due = dueDateFrom({
      method: 'ultrasound',
      scanDate: '2026-04-01',
      gestationalWeeks: 12,
      gestationalDays: 0,
    });
    expect(due).toBe('2026-10-14');
    expect(gestationDays(due, '2026-04-01')).toBe(84);
  });

  it.each([
    [5, '2026-09-19'],
    [3, '2026-09-21'],
  ])('dates IVF from a day-%i transfer', (embryoAgeDays, due) => {
    expect(
      dueDateFrom({ method: 'ivf', transferDate: '2026-01-01', embryoAgeDays }),
    ).toBe(due);
  });

  it('agrees between methods for the same pregnancy', () => {
    const lmp = dueDateFrom({ method: 'lmp', lmpDate: '2026-01-01' });
    // Conception ~2 weeks after LMP; a day-5 embryo transferred 5 days after conception.
    const ivf = dueDateFrom({
      method: 'ivf',
      transferDate: '2026-01-20',
      embryoAgeDays: 5,
    });
    expect(ivf).toBe(lmp);
  });
});

describe('gestational age', () => {
  const due = '2026-10-08';

  it.each([
    ['2026-01-01', 0, { weeks: 0, days: 0 }],
    ['2026-03-26', 84, { weeks: 12, days: 0 }],
    ['2026-03-29', 87, { weeks: 12, days: 3 }],
    ['2026-10-08', 280, { weeks: 40, days: 0 }],
  ])('on %s is %i days', (date, days, ga) => {
    expect(gestationDays(due, date)).toBe(days);
    expect(toGestationalAge(days)).toEqual(ga);
  });

  it('never reports negative weeks', () => {
    expect(toGestationalAge(-10)).toEqual({ weeks: 0, days: 0 });
  });

  it('round-trips dates and gestation', () => {
    for (const days of [0, 97, 98, 195, 196, 259, 280, 294]) {
      expect(gestationDays(due, dateAtGestation(due, days))).toBe(days);
    }
  });
});

describe('trimesters and term (ACOG)', () => {
  it.each([
    [0, 1],
    [97, 1], // 13w6d
    [98, 2], // 14w0d
    [195, 2], // 27w6d
    [196, 3], // 28w0d
    [300, 3],
  ])('%i days → trimester %i', (days, t) => {
    expect(trimesterFor(days)).toBe(t);
  });

  it.each([
    [258, 'preterm'], // 36w6d
    [259, 'early_term'], // 37w0d
    [272, 'early_term'], // 38w6d
    [273, 'full_term'], // 39w0d
    [286, 'full_term'], // 40w6d
    [287, 'late_term'], // 41w0d
    [294, 'postterm'], // 42w0d
  ])('%i days → %s', (days, status) => {
    expect(termStatusFor(days)).toBe(status);
  });

  it.each([
    [0, 1],
    [6, 1],
    [87, 12],
    [294, 42],
    [305, 42],
  ])('%i days → week-guide week %i', (days, week) => {
    expect(guideWeekFor(days)).toBe(week);
  });
});

describe('datingProblems', () => {
  const today = '2026-06-01';
  const ok: DatingInput[] = [
    { method: 'lmp', lmpDate: '2026-05-01' },
    { method: 'due_date', dueDate: '2026-12-01' },
    {
      method: 'ultrasound',
      scanDate: '2026-05-20',
      gestationalWeeks: 8,
      gestationalDays: 2,
    },
    { method: 'ivf', transferDate: '2026-05-10', embryoAgeDays: 5 },
  ];

  it.each(ok)('accepts a plausible %j', (input) => {
    expect(datingProblems(input, today)).toEqual([]);
  });

  it.each([
    [{ method: 'lmp', lmpDate: '2026-06-02' }, 'lmpDate'],
    [
      {
        method: 'ultrasound',
        scanDate: '2026-07-01',
        gestationalWeeks: 10,
        gestationalDays: 0,
      },
      'scanDate',
    ],
    [
      { method: 'ivf', transferDate: '2026-06-10', embryoAgeDays: 5 },
      'transferDate',
    ],
  ] as const)('rejects a future input date %j', (input, path) => {
    expect(
      datingProblems(input as DatingInput, today).map((p) => p.path),
    ).toContain(path);
  });

  it('rejects a due date more than 40 weeks away', () => {
    expect(
      datingProblems({ method: 'due_date', dueDate: '2027-04-01' }, today)[0]
        ?.path,
    ).toBe('dueDate');
  });

  it('rejects more than 44 weeks of pregnancy', () => {
    expect(
      datingProblems({ method: 'lmp', lmpDate: '2025-07-01' }, today),
    ).toHaveLength(1);
  });

  it('accepts a pregnancy past its due date but under 44 weeks', () => {
    expect(
      datingProblems({ method: 'due_date', dueDate: '2026-05-20' }, today),
    ).toEqual([]);
  });
});

describe('timelineFor', () => {
  it('lists 42 contiguous weeks and the ACOG milestones', () => {
    const t = Timeline.parse(timelineFor('2026-10-08', '2026-06-01'));
    expect(t.weeks).toHaveLength(42);
    expect(t.weeks[0]).toEqual({
      week: 1,
      startDate: '2026-01-08',
      endDate: '2026-01-14',
      trimester: 1,
    });
    for (let i = 1; i < t.weeks.length; i++) {
      expect(gestationDays(t.dueDate, t.weeks[i]!.startDate)).toBe(
        gestationDays(t.dueDate, t.weeks[i - 1]!.endDate) + 1,
      );
    }
    expect(t.weeks.find((w) => w.week === 14)?.trimester).toBe(2);
    expect(t.weeks.find((w) => w.week === 28)?.trimester).toBe(3);
    const due = t.milestones.find((m) => m.key === 'due_date');
    expect(due).toMatchObject({
      date: '2026-10-08',
      gestationalAge: { weeks: 40, days: 0 },
      status: 'upcoming',
    });
    expect(
      t.milestones.find((m) => m.key === 'second_trimester'),
    ).toMatchObject({ date: '2026-04-09', status: 'past' });
  });

  it('marks a milestone falling today', () => {
    const t = timelineFor('2026-10-08', '2026-10-08');
    expect(t.milestones.find((m) => m.key === 'due_date')?.status).toBe(
      'today',
    );
  });
});
