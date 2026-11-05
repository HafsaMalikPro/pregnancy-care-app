import { Injectable } from '@nestjs/common';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Pregnancy as PregnancyRow } from '../generated/prisma/client.js';
import {
  gestationDays,
  guideWeekFor,
  trimesterFor,
} from '../pregnancy/dating.js';
import { toIsoDate } from './dates.js';
import { OwnerClock } from './owner-clock.js';

export interface ActivePregnancy {
  row: PregnancyRow;
  /** Today in the owner's time zone. */
  today: string;
  /** Week-guide week for `today` (1-42). */
  week: number;
  trimester: 1 | 2 | 3;
}

/**
 * The owner's active pregnancy as of today in their own time zone. Uses the same dating
 * functions as the pregnancy endpoints, so every module agrees on the week.
 */
@Injectable()
export class PregnancyContext {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: OwnerClock,
  ) {}

  async active(
    owner: Owner,
    now = new Date(),
  ): Promise<ActivePregnancy | null> {
    const [row, today] = await Promise.all([
      this.prisma.pregnancy.findFirst({
        where: { ...ownerWhere(owner), status: 'active' },
      }),
      this.clock.today(owner, now),
    ]);
    if (!row) return null;
    return { row, today, ...weekOn(toIsoDate(row.dueDate), today) };
  }
}

/** Week and trimester on `date` for a pregnancy due on `dueDate`. */
export function weekOn(
  dueDate: string,
  date: string,
): { week: number; trimester: 1 | 2 | 3 } {
  const days = gestationDays(dueDate, date);
  return {
    week: guideWeekFor(days),
    trimester: trimesterFor(Math.max(0, days)),
  };
}

/** True when `week` is inside [from, to]; null when the window is open on both sides. */
export function inWeekWindow(
  week: number,
  from: number | null,
  to: number | null,
): boolean | null {
  if (from === null && to === null) return null;
  return (from === null || week >= from) && (to === null || week <= to);
}
