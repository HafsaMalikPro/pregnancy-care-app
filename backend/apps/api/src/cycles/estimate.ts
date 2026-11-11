import type { CycleEstimate } from '@preconception/contracts';
import { daysBetween } from '@preconception/utils';
import { addDays } from '../common/dates.js';

export const ESTIMATE_METHOD = 'calendar-average@1';

/** Starts at most this many cycles back are used. */
const MAX_CYCLES = 6;
/** Gaps outside this range are treated as missed logs, not real cycles. */
const MIN_PLAUSIBLE_DAYS = 15;
const MAX_PLAUSIBLE_DAYS = 90;
/** Typical-range guidance shown when cycles are irregular. */
const TYPICAL_MIN = 21;
const TYPICAL_MAX = 35;

export const LIMITATIONS = {
  always: [
    'This is a calendar estimate based only on the period start dates you logged. It is not a medical prediction.',
    'It does not detect ovulation or a fertile window and must not be used as contraception.',
  ],
  insufficient:
    'Log at least three period start dates (two complete cycles) to get an estimate.',
  irregular: `Your recent cycle lengths vary a lot, so this window is less reliable. If your cycles are often shorter than ${TYPICAL_MIN} or longer than ${TYPICAL_MAX} days, consider talking to a clinician.`,
  gaps: 'Some gaps between logged periods were too long or too short to be single cycles and were left out; they may be missed logs.',
  overdue:
    'Your next period is later than the estimated window. Cycles vary for many reasons; if you might be pregnant or are concerned, a test or a clinician can help.',
};

/**
 * Average cycle length over the most recent cycles, projected from the latest period start.
 * Pure: no I/O, no clock. Dates are YYYY-MM-DD; `today` is in the person's time zone.
 */
export function estimateNextPeriod(
  periodStarts: string[],
  today: string,
): CycleEstimate {
  const starts = [...new Set(periodStarts)].sort().reverse();
  const recent = starts.slice(0, MAX_CYCLES + 1);

  const lengths: number[] = [];
  let skipped = 0;
  for (let i = 0; i < recent.length - 1; i++) {
    const length = daysBetween(recent[i + 1]!, recent[i]!);
    if (length >= MIN_PLAUSIBLE_DAYS && length <= MAX_PLAUSIBLE_DAYS) {
      lengths.push(length);
    } else {
      skipped++;
    }
  }

  const limitations = [...LIMITATIONS.always];
  if (skipped > 0) limitations.push(LIMITATIONS.gaps);

  if (lengths.length < 2 || !recent[0]) {
    limitations.push(LIMITATIONS.insufficient);
    return {
      method: ESTIMATE_METHOD,
      confidence: 'insufficient_history',
      nextPeriodWindow: null,
      cyclesUsed: lengths.length,
      limitations,
    };
  }

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(
    lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length,
  );
  const spread = Math.min(10, Math.max(2, Math.ceil(sd)));
  const centre = addDays(recent[0], Math.round(mean));
  const window = {
    earliest: addDays(centre, -spread),
    latest: addDays(centre, spread),
  };

  const irregular =
    sd > 7 || lengths.some((l) => l < TYPICAL_MIN || l > TYPICAL_MAX + 10);
  if (irregular) limitations.push(LIMITATIONS.irregular);
  if (window.latest < today) limitations.push(LIMITATIONS.overdue);

  return {
    method: ESTIMATE_METHOD,
    confidence:
      !irregular && lengths.length >= 3 && sd <= 3 ? 'moderate' : 'low',
    nextPeriodWindow: window,
    cyclesUsed: lengths.length,
    limitations,
  };
}
