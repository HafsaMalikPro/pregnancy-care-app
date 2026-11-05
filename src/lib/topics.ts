import type { ArticleSummary, WeekGuide } from "./types";

/** Trimester boundaries (ACOG), matching the API's timeline: 1–13, 14–27, 28–42. */
export const TRIMESTER_WEEKS = {
  1: [1, 13],
  2: [14, 27],
  3: [28, 42],
} as const satisfies Record<1 | 2 | 3, readonly [number, number]>;

export type Trimester = keyof typeof TRIMESTER_WEEKS;

export function trimesterForWeek(week: number): Trimester {
  if (week <= 13) return 1;
  if (week <= 27) return 2;
  return 3;
}

/**
 * Pulls one section out of every published guide, grouped by trimester. Weeks without a
 * published guide, or whose section is empty, are left out rather than filled in.
 */
export function sectionByTrimester<T>(
  guides: (WeekGuide | null)[],
  pick: (guide: WeekGuide) => T | null | undefined,
): Record<Trimester, { week: number; value: T }[]> {
  const out: Record<Trimester, { week: number; value: T }[]> = { 1: [], 2: [], 3: [] };
  for (const guide of guides) {
    if (!guide) continue;
    const value = pick(guide);
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    out[trimesterForWeek(guide.week)].push({ week: guide.week, value });
  }
  for (const t of [1, 2, 3] as const) out[t].sort((a, b) => a.week - b.week);
  return out;
}

export interface WeekRun<T> {
  from: number;
  to: number;
  value: T;
}

/**
 * Merges consecutive weeks whose value is identical into one run (weeks 6–9 with the same
 * advice become a single entry), so repeated guidance isn't listed week after week.
 */
export function mergeRuns<T>(items: { week: number; value: T }[]): WeekRun<T>[] {
  const runs: WeekRun<T>[] = [];
  for (const { week, value } of items) {
    const last = runs.at(-1);
    if (last && last.to === week - 1 && JSON.stringify(last.value) === JSON.stringify(value)) {
      last.to = week;
    } else {
      runs.push({ from: week, to: week, value });
    }
  }
  return runs;
}

/** Distinct, non-empty list items across guides, in first-seen order. */
export function uniqueItems(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const item = raw.trim();
      const key = item.toLowerCase();
      if (item && !seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
  }
  return out;
}

/** Articles whose slug or title mentions any of the words (case-insensitive). */
export function articlesAbout(articles: ArticleSummary[], words: RegExp): ArticleSummary[] {
  return articles.filter((a) => words.test(`${a.slug} ${a.title}`));
}

export const TOPIC_WORDS = {
  nutrition: /food|eat|nutri|diet|meal|folic|vitamin|iron|caffeine|alcohol|recipe|hydrat|water/i,
  exercise: /exercis|move|activ|yoga|walk|fit|stretch|pelvic|posture|breath/i,
  baby: /baby|newborn|feed|breast|formula|sleep|nappy|diaper|bath|cord|car seat/i,
  birth: /birth|labou?r|hospital bag|deliver|postpartum|postnatal|recovery|after the birth/i,
} as const;
