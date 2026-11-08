import { Injectable } from '@nestjs/common';
import type { TriageStage } from '@preconception/contracts';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { PrismaService } from '../database/prisma.service.js';
import { daysBetween } from '@preconception/utils';
import { toIsoDate } from './dates.js';
import { OwnerClock } from './owner-clock.js';

/**
 * Warning signs after birth apply for up to a year (CDC Hear Her), so the red-flag screen offers
 * postpartum signs for that long. The six-week postpartum guide is a separate, shorter window.
 */
export const POSTPARTUM_WARNING_DAYS = 365;

export interface JourneyStageInfo {
  stage: TriageStage;
  today: string;
  /** The most recent birth, when the stage is postpartum. */
  birth: {
    pregnancyId: string;
    birthDate: string;
    daysSinceBirth: number;
  } | null;
}

/** Where the owner is: pregnant, after a birth, or neither (or not shared). */
@Injectable()
export class JourneyStage {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: OwnerClock,
  ) {}

  async resolve(owner: Owner, now = new Date()): Promise<JourneyStageInfo> {
    const [today, active, birth] = await Promise.all([
      this.clock.today(owner, now),
      this.prisma.pregnancy.findFirst({
        where: { ...ownerWhere(owner), status: 'active' },
        select: { id: true },
      }),
      this.prisma.pregnancy.findFirst({
        where: {
          ...ownerWhere(owner),
          status: 'ended',
          outcome: 'birth',
          endedOn: { not: null },
        },
        orderBy: { endedOn: 'desc' },
        select: { id: true, endedOn: true },
      }),
    ]);
    if (active) return { stage: 'pregnancy', today, birth: null };
    if (birth?.endedOn) {
      const birthDate = toIsoDate(birth.endedOn);
      const days = daysBetween(birthDate, today);
      if (days >= 0 && days <= POSTPARTUM_WARNING_DAYS) {
        return {
          stage: 'postpartum',
          today,
          birth: { pregnancyId: birth.id, birthDate, daysSinceBirth: days },
        };
      }
    }
    return { stage: 'unknown', today, birth: null };
  }
}
