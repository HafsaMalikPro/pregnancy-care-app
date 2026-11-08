/**
 * When a reminder fires next. Reminders store a local wall-clock time ("HH:MM") and an
 * RRULE subset (FREQ=DAILY or FREQ=WEEKLY;BYDAY=...), interpreted in the owner's IANA time
 * zone. Pure functions over Intl; no clock of their own.
 *
 * Daylight-saving rules:
 * - a time skipped by a spring-forward gap fires at the same offset as before the gap
 *   (02:30 on a 02:00→03:00 night fires at 03:30);
 * - a time that occurs twice on a fall-back night fires once, at the first occurrence.
 */

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Weekdays (0 = Sunday) a rule fires on. */
export function ruleWeekdays(rule: string): Set<number> {
  if (rule === 'FREQ=DAILY') return new Set([0, 1, 2, 3, 4, 5, 6]);
  const days = rule.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(',') ?? [];
  return new Set(
    days
      .map((d) => WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number]))
      .filter((i) => i >= 0),
  );
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Wall-clock fields of an instant in a time zone. */
export function wallTime(instant: number, timeZone: string): Wall {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

/** UTC offset (ms) of a time zone at an instant. */
function offsetAt(instant: number, timeZone: string): number {
  const w = wallTime(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/** The instant a wall-clock time happens in a zone, following the DST rules above. */
export function zonedToInstant(wall: Wall, timeZone: string): number {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  );
  const before = naive - offsetAt(naive - 12 * HOUR_MS, timeZone);
  const after = naive - offsetAt(naive + 12 * HOUR_MS, timeZone);
  const matches = [before, after].filter((t) => {
    const w = wallTime(t, timeZone);
    return (
      w.day === wall.day && w.hour === wall.hour && w.minute === wall.minute
    );
  });
  // Ambiguous (fall back): the earlier instant. Gap (spring forward): the pre-gap offset.
  return matches.length > 0 ? Math.min(...matches) : before;
}

/**
 * The first time strictly after `after` that the reminder fires, or null if the rule has no
 * weekdays. Looks at most eight local days ahead, which covers every weekly rule.
 */
export function nextOccurrence(
  after: Date,
  localTime: string,
  rule: string,
  timeZone: string,
): Date | null {
  const days = ruleWeekdays(rule);
  if (days.size === 0) return null;
  const [hour, minute] = localTime.split(':').map(Number);
  const today = wallTime(after.getTime(), timeZone);
  const start = Date.UTC(today.year, today.month - 1, today.day);
  for (let i = 0; i <= 8; i++) {
    const d = new Date(start + i * DAY_MS);
    if (!days.has(d.getUTCDay())) continue;
    const instant = zonedToInstant(
      {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour,
        minute,
      },
      timeZone,
    );
    if (instant > after.getTime()) return new Date(instant);
  }
  return null;
}

/**
 * Whether a local "HH:MM" falls inside quiet hours [start, end). The window may cross midnight
 * (22:00-07:00). No window (either end null) means never quiet.
 */
export function inQuietHours(
  localTime: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end || start === end) return false;
  return start < end
    ? localTime >= start && localTime < end
    : localTime >= start || localTime < end;
}
