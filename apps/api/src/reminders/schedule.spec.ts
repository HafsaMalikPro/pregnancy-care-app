import {
  inQuietHours,
  nextOccurrence,
  ruleWeekdays,
  zonedToInstant,
} from './schedule.js';

const at = (iso: string) => new Date(iso);
const next = (after: string, time: string, rule: string, tz: string) =>
  nextOccurrence(at(after), time, rule, tz)?.toISOString();

describe('ruleWeekdays', () => {
  it('reads daily and weekly rules', () => {
    expect([...ruleWeekdays('FREQ=DAILY')]).toHaveLength(7);
    expect(
      [...ruleWeekdays('FREQ=WEEKLY;BYDAY=MO,TH')].sort((a, b) => a - b),
    ).toEqual([1, 4]);
  });
});

describe('nextOccurrence', () => {
  it('fires later today when the time has not passed yet', () => {
    expect(next('2026-10-29T06:00:00Z', '08:30', 'FREQ=DAILY', 'UTC')).toBe(
      '2026-10-29T08:30:00.000Z',
    );
  });

  it('moves to tomorrow once the time has passed, and never returns the same instant', () => {
    expect(next('2026-10-29T08:30:00Z', '08:30', 'FREQ=DAILY', 'UTC')).toBe(
      '2026-10-30T08:30:00.000Z',
    );
  });

  it('uses the owner time zone, including across the date line', () => {
    // 20:00 in Karachi (UTC+5) is 15:00 UTC.
    expect(
      next('2026-10-29T10:00:00Z', '20:00', 'FREQ=DAILY', 'Asia/Karachi'),
    ).toBe('2026-10-29T15:00:00.000Z');
    // 07:00 in Auckland on 30 Oct (UTC+13 in NZ summer) is 18:00 UTC on 29 Oct.
    expect(
      next('2026-10-29T10:00:00Z', '07:00', 'FREQ=DAILY', 'Pacific/Auckland'),
    ).toBe('2026-10-29T18:00:00.000Z');
  });

  it('only fires on the listed weekdays', () => {
    // 2026-10-29 is a Thursday; next Monday is 2 Nov.
    expect(
      next(
        '2026-10-29T12:00:00Z',
        '09:00',
        'FREQ=WEEKLY;BYDAY=MO',
        'Europe/London',
      ),
    ).toBe('2026-11-02T09:00:00.000Z');
    // Same weekday but the time has passed: a week later.
    expect(
      next(
        '2026-10-29T12:00:00Z',
        '09:00',
        'FREQ=WEEKLY;BYDAY=TH',
        'Europe/London',
      ),
    ).toBe('2026-11-05T09:00:00.000Z');
  });

  it('keeps local time across a DST change (London, last Sunday of October)', () => {
    // BST (UTC+1) on Saturday 24 Oct 2026, GMT (UTC+0) from Sunday 25 Oct.
    expect(
      next('2026-10-24T12:00:00Z', '08:00', 'FREQ=DAILY', 'Europe/London'),
    ).toBe('2026-10-25T08:00:00.000Z');
    expect(
      next('2026-10-23T12:00:00Z', '08:00', 'FREQ=DAILY', 'Europe/London'),
    ).toBe('2026-10-24T07:00:00.000Z');
  });

  it('fires once, at the first occurrence, for a repeated fall-back time (New York)', () => {
    // 1 Nov 2026: 01:30 happens at 05:30Z (EDT) and again at 06:30Z (EST).
    expect(
      next('2026-11-01T00:00:00Z', '01:30', 'FREQ=DAILY', 'America/New_York'),
    ).toBe('2026-11-01T05:30:00.000Z');
    expect(
      next('2026-11-01T05:30:00Z', '01:30', 'FREQ=DAILY', 'America/New_York'),
    ).toBe('2026-11-02T06:30:00.000Z');
  });

  it('shifts a time skipped by spring forward past the gap (New York)', () => {
    // 14 Mar 2027: 02:00 EST jumps to 03:00 EDT, so 02:30 fires at 03:30 EDT = 07:30Z.
    expect(
      next('2027-03-14T00:00:00Z', '02:30', 'FREQ=DAILY', 'America/New_York'),
    ).toBe('2027-03-14T07:30:00.000Z');
  });

  it('handles leap days', () => {
    expect(next('2028-02-28T23:00:00Z', '09:00', 'FREQ=DAILY', 'UTC')).toBe(
      '2028-02-29T09:00:00.000Z',
    );
  });
});

describe('zonedToInstant', () => {
  it('converts a plain wall time', () => {
    expect(
      new Date(
        zonedToInstant(
          { year: 2026, month: 7, day: 1, hour: 12, minute: 0 },
          'Europe/Paris',
        ),
      ).toISOString(),
    ).toBe('2026-07-01T10:00:00.000Z');
  });
});

describe('inQuietHours', () => {
  it('is never quiet without a window', () => {
    expect(inQuietHours('03:00', null, null)).toBe(false);
    expect(inQuietHours('03:00', '22:00', null)).toBe(false);
    expect(inQuietHours('03:00', '09:00', '09:00')).toBe(false);
  });

  it('handles a same-day window, start inclusive and end exclusive', () => {
    expect(inQuietHours('13:00', '13:00', '15:00')).toBe(true);
    expect(inQuietHours('14:59', '13:00', '15:00')).toBe(true);
    expect(inQuietHours('15:00', '13:00', '15:00')).toBe(false);
    expect(inQuietHours('12:59', '13:00', '15:00')).toBe(false);
  });

  it('handles a window that crosses midnight', () => {
    expect(inQuietHours('22:00', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('23:30', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('00:00', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('07:00', '22:00', '07:00')).toBe(false);
    expect(inQuietHours('21:59', '22:00', '07:00')).toBe(false);
  });
});
