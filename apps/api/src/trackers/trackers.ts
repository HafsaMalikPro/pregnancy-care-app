import type {
  Contraction,
  ContractionDay,
  KickSession,
  KickThreshold,
} from '@preconception/contracts';
import { TRIAGE_RULES } from '../symptoms/triage.js';

/** Fixed wording. The app computes times and counts only; it gives no other advice. */
export const TRACKER_TEXT = {
  kickThresholdLabel:
    'The number of movements and the time window are the ones your clinician gave you. The app never suggests a number. Without one, sessions are recorded but not compared.',
  kickDisclaimer:
    "This is general information, not medical advice. Counting doesn't replace contacting your maternity team: if you're worried about your baby's movements at any time, contact them now.",
  kickAlert: {
    headline: "Fewer movements than your clinician's number",
    message:
      "You counted fewer movements than the number your clinician gave you for this time window. Contact your maternity unit or doctor now. Don't wait until tomorrow.",
  },
  contractionMessage:
    "This timer only records times. If you think labour has started, or you're unsure about anything, contact your maternity unit.",
} as const;

const seconds = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

export interface KickRow {
  id: string;
  date: string;
  startedAt: Date;
  endedAt: Date | null;
  count: number;
}

/**
 * Compares an ended session with the clinician-set threshold.
 * - true: the full window passed with fewer movements than the threshold;
 * - false: the threshold was reached (at any point in the session);
 * - null: no threshold, still running, or stopped before the window ended without reaching it
 *   (incomplete: never reported as reassuring).
 */
export function belowThreshold(
  s: Pick<KickRow, 'startedAt' | 'endedAt' | 'count'>,
  threshold: Pick<KickThreshold, 'count' | 'windowMinutes'> | null,
): boolean | null {
  if (!threshold || !s.endedAt) return null;
  if (s.count >= threshold.count) return false;
  const windowComplete =
    seconds(s.startedAt, s.endedAt) >= threshold.windowMinutes * 60;
  return windowComplete ? true : null;
}

export function toKickSession(
  row: KickRow,
  threshold: Pick<KickThreshold, 'count' | 'windowMinutes'> | null,
): KickSession {
  const below = belowThreshold(row, threshold);
  return {
    id: row.id,
    date: row.date,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    count: row.count,
    durationSeconds: row.endedAt ? seconds(row.startedAt, row.endedAt) : null,
    belowThreshold: below,
    alert: below
      ? {
          ...TRACKER_TEXT.kickAlert,
          callToAction: TRIAGE_RULES.levels.emergency.callToAction,
        }
      : null,
  };
}

export interface ContractionRow {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
}

/** Durations, start-to-start intervals and averages for one day's contractions. */
export function contractionDay(
  date: string,
  rows: readonly ContractionRow[],
): ContractionDay {
  const sorted = [...rows].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );
  const contractions: Contraction[] = sorted.map((r, i) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    durationSeconds: r.endedAt ? seconds(r.startedAt, r.endedAt) : null,
    intervalSeconds:
      i === 0 ? null : seconds(sorted[i - 1].startedAt, r.startedAt),
  }));
  const avg = (values: (number | null)[]) => {
    const xs = values.filter((v): v is number => v !== null);
    return xs.length
      ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
      : null;
  };
  return {
    date,
    contractions,
    count: contractions.length,
    averageDurationSeconds: avg(contractions.map((c) => c.durationSeconds)),
    averageIntervalSeconds: avg(contractions.map((c) => c.intervalSeconds)),
    message: TRACKER_TEXT.contractionMessage,
  };
}
