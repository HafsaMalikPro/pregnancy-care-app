import { CycleEstimate } from '@preconception/contracts';
import { estimateNextPeriod, LIMITATIONS } from './estimate.js';

const TODAY = '2026-10-18';

describe('estimateNextPeriod (calendar-average@1)', () => {
  it.each([[[]], [['2026-10-01']], [['2026-09-03', '2026-10-01']]])(
    'reports insufficient history for %j',
    (starts) => {
      const e = estimateNextPeriod(starts, TODAY);
      expect(CycleEstimate.parse(e)).toMatchObject({
        confidence: 'insufficient_history',
        nextPeriodWindow: null,
      });
      expect(e.limitations).toContain(LIMITATIONS.insufficient);
    },
  );

  it('always includes the not-a-medical-prediction and not-contraception limitations', () => {
    for (const starts of [
      [],
      ['2026-07-09', '2026-08-06', '2026-09-03', '2026-10-01'],
    ]) {
      const e = estimateNextPeriod(starts, TODAY);
      for (const l of LIMITATIONS.always) expect(e.limitations).toContain(l);
    }
  });

  it('projects regular 28-day cycles with moderate confidence and a ±2 day window', () => {
    const e = estimateNextPeriod(
      ['2026-07-09', '2026-08-06', '2026-09-03', '2026-10-01'],
      TODAY,
    );
    expect(e).toMatchObject({
      method: 'calendar-average@1',
      confidence: 'moderate',
      cyclesUsed: 3,
      nextPeriodWindow: { earliest: '2026-10-27', latest: '2026-10-31' },
    });
  });

  it('is order- and duplicate-insensitive', () => {
    const a = estimateNextPeriod(
      ['2026-07-09', '2026-08-06', '2026-09-03', '2026-10-01'],
      TODAY,
    );
    const b = estimateNextPeriod(
      ['2026-10-01', '2026-07-09', '2026-09-03', '2026-08-06', '2026-10-01'],
      TODAY,
    );
    expect(b).toEqual(a);
  });

  it('gives low confidence with only two complete cycles', () => {
    const e = estimateNextPeriod(
      ['2026-08-06', '2026-09-03', '2026-10-01'],
      TODAY,
    );
    expect(e.confidence).toBe('low');
    expect(e.nextPeriodWindow).not.toBeNull();
  });

  it('widens the window and flags irregular cycles', () => {
    // Lengths 22, 40, 25, 38
    const e = estimateNextPeriod(
      ['2026-05-01', '2026-05-23', '2026-07-02', '2026-07-27', '2026-09-03'],
      TODAY,
    );
    expect(e.confidence).toBe('low');
    expect(e.limitations).toContain(LIMITATIONS.irregular);
    const { earliest, latest } = e.nextPeriodWindow!;
    const width = (Date.parse(latest) - Date.parse(earliest)) / 86_400_000;
    expect(width).toBeGreaterThan(4);
    expect(width).toBeLessThanOrEqual(20);
  });

  it('skips implausible gaps as missed logs and says so', () => {
    // 120-day gap (missed logs) then three regular cycles.
    const e = estimateNextPeriod(
      ['2026-03-12', '2026-07-10', '2026-08-07', '2026-09-04', '2026-10-02'],
      TODAY,
    );
    expect(e.cyclesUsed).toBe(3);
    expect(e.limitations).toContain(LIMITATIONS.gaps);
    expect(e.confidence).toBe('moderate');
  });

  it('uses at most the six most recent cycles', () => {
    const starts = ['2025-01-01', '2025-03-15']; // old, long gap: must be ignored
    let d = Date.parse('2026-03-01');
    for (let i = 0; i < 8; i++, d += 30 * 86_400_000)
      starts.push(new Date(d).toISOString().slice(0, 10));
    const e = estimateNextPeriod(starts, '2026-10-18');
    expect(e.cyclesUsed).toBe(6);
    expect(e.limitations).not.toContain(LIMITATIONS.gaps);
  });

  it('notes when the window has already passed', () => {
    const e = estimateNextPeriod(
      ['2026-06-04', '2026-07-02', '2026-07-30', '2026-08-27'],
      '2026-10-18',
    );
    expect(e.limitations).toContain(LIMITATIONS.overdue);
  });

  it('never claims more than moderate confidence', () => {
    const starts: string[] = [];
    let d = Date.parse('2026-01-01');
    for (let i = 0; i < 10; i++, d += 28 * 86_400_000)
      starts.push(new Date(d).toISOString().slice(0, 10));
    expect(estimateNextPeriod(starts, TODAY).confidence).toBe('moderate');
  });
});
