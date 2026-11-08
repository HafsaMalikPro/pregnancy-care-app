import {
  belowThreshold,
  contractionDay,
  toKickSession,
  TRACKER_TEXT,
} from './trackers.js';

const at = (min: number) =>
  new Date(Date.UTC(2026, 10, 7, 10, 0) + min * 60_000);
const threshold = { count: 10, windowMinutes: 120 };

describe('kick counter threshold', () => {
  it('is null without a threshold or while the session runs', () => {
    expect(
      belowThreshold({ startedAt: at(0), endedAt: at(130), count: 2 }, null),
    ).toBeNull();
    expect(
      belowThreshold({ startedAt: at(0), endedAt: null, count: 2 }, threshold),
    ).toBeNull();
  });

  it('is false once the threshold is reached, however quickly', () => {
    expect(
      belowThreshold(
        { startedAt: at(0), endedAt: at(15), count: 10 },
        threshold,
      ),
    ).toBe(false);
    expect(
      belowThreshold(
        { startedAt: at(0), endedAt: at(200), count: 12 },
        threshold,
      ),
    ).toBe(false);
  });

  it('is true when the full window passed with fewer movements', () => {
    expect(
      belowThreshold(
        { startedAt: at(0), endedAt: at(120), count: 9 },
        threshold,
      ),
    ).toBe(true);
    expect(
      belowThreshold(
        { startedAt: at(0), endedAt: at(180), count: 0 },
        threshold,
      ),
    ).toBe(true);
  });

  it('never reads an incomplete session as reassuring', () => {
    expect(
      belowThreshold(
        { startedAt: at(0), endedAt: at(30), count: 3 },
        threshold,
      ),
    ).toBeNull();
  });

  it('attaches the alert template and the emergency call to action only when below', () => {
    const below = toKickSession(
      {
        id: 'a',
        date: '2026-11-07',
        startedAt: at(0),
        endedAt: at(120),
        count: 4,
      },
      threshold,
    );
    expect(below.belowThreshold).toBe(true);
    expect(below.alert).toMatchObject({
      headline: TRACKER_TEXT.kickAlert.headline,
      callToAction: {
        kind: 'emergency',
        label: 'Call your doctor now or go to emergency services',
      },
    });
    expect(below.durationSeconds).toBe(7200);
    const fine = toKickSession(
      {
        id: 'b',
        date: '2026-11-07',
        startedAt: at(0),
        endedAt: at(20),
        count: 10,
      },
      threshold,
    );
    expect(fine.alert).toBeNull();
  });
});

describe('contraction timer', () => {
  it('computes durations, start-to-start intervals and averages', () => {
    const day = contractionDay('2026-11-07', [
      {
        id: '2',
        startedAt: at(10),
        endedAt: new Date(at(10).getTime() + 50_000),
      },
      {
        id: '1',
        startedAt: at(0),
        endedAt: new Date(at(0).getTime() + 40_000),
      },
      { id: '3', startedAt: at(18), endedAt: null },
    ]);
    expect(day.contractions.map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(day.contractions.map((c) => c.durationSeconds)).toEqual([
      40,
      50,
      null,
    ]);
    expect(day.contractions.map((c) => c.intervalSeconds)).toEqual([
      null,
      600,
      480,
    ]);
    expect(day).toMatchObject({
      count: 3,
      averageDurationSeconds: 45,
      averageIntervalSeconds: 540,
    });
  });

  it('handles an empty day and always carries the standard message only', () => {
    const day = contractionDay('2026-11-07', []);
    expect(day).toMatchObject({
      count: 0,
      averageDurationSeconds: null,
      averageIntervalSeconds: null,
    });
    expect(day.message).toBe(TRACKER_TEXT.contractionMessage);
    expect(day.message).toContain('contact your maternity unit');
  });
});
