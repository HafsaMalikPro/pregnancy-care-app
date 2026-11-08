import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BirthPreferences,
  DatingInput,
  DatingSource,
  FetusCount,
  PageInfo,
  Pregnancy,
  PregnancyOutcome,
  Timeline,
  WeekGuide,
} from '@preconception/contracts';
import { daysBetween } from '@preconception/utils';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { fromIsoDate, toIsoDate } from '../common/dates.js';
import { OwnerClock } from '../common/owner-clock.js';
import { type PageQueryDto, pageInfo } from '../common/pagination.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  BirthPreferences as BirthPreferencesRow,
  Pregnancy as PregnancyRow,
} from '../generated/prisma/client.js';
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
import { WeekGuideService } from './week-guide.service.js';

export interface PregnancyDetails {
  firstPregnancy?: boolean | null;
  fetusCount?: FetusCount;
  confirmedByClinician?: boolean | null;
  restrictExercise?: boolean;
  foodRestrictions?: string[];
  clinicianNutritionPlan?: boolean;
}

export interface DatingChange {
  previousDueDate: string;
  newDueDate: string;
  /** Positive = the due date moved later. */
  shiftDays: number;
}

/**
 * Pregnancy dating and details. Every date is computed here, never on a client, and is
 * presented as an estimate. Writes are health data and need consent.
 */
@Injectable()
export class PregnancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly clock: OwnerClock,
    private readonly guides: WeekGuideService,
  ) {}

  async create(
    owner: Owner,
    dating: DatingInput,
    source: DatingSource,
    details: PregnancyDetails,
  ): Promise<Pregnancy> {
    await this.consent.assertHealthDataConsent(owner);
    const today = await this.clock.today(owner);
    const dueDate = this.checkedDueDate(dating, today);
    if (await this.findActive(owner)) {
      throw new ConflictException(
        'There is already an active pregnancy; update or end it first.',
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.pregnancy.create({
        data: {
          ...ownerWhere(owner),
          dueDate: fromIsoDate(dueDate),
          datingMethod: dating.method,
          datingSource: source,
          ...cleanDetails(details),
        },
      });
      await tx.pregnancyDating.create({
        data: {
          pregnancyId: created.id,
          method: dating.method,
          source,
          inputs: dating,
          dueDate: fromIsoDate(dueDate),
        },
      });
      return created;
    });
    return toPregnancy(row, today);
  }

  async current(owner: Owner): Promise<Pregnancy> {
    return toPregnancy(
      await this.requireActive(owner),
      await this.clock.today(owner),
    );
  }

  async list(
    owner: Owner,
    query: PageQueryDto,
  ): Promise<{ items: Pregnancy[]; page: PageInfo }> {
    const where = ownerWhere(owner);
    const [rows, total, today] = await Promise.all([
      this.prisma.pregnancy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.pregnancy.count({ where }),
      this.clock.today(owner),
    ]);
    return {
      items: rows.map((r) => toPregnancy(r, today)),
      page: pageInfo(query, total),
    };
  }

  async updateDetails(
    owner: Owner,
    details: PregnancyDetails,
  ): Promise<Pregnancy> {
    await this.consent.assertHealthDataConsent(owner);
    const active = await this.requireActive(owner);
    // owner-scope: `active` is the owner's active pregnancy (ownerWhere)
    const row = await this.prisma.pregnancy.update({
      where: { id: active.id },
      data: cleanDetails(details),
    });
    return toPregnancy(row, await this.clock.today(owner));
  }

  /** Re-dates the active pregnancy (e.g. after a scan) and reports how far the date moved. */
  async redate(
    owner: Owner,
    dating: DatingInput,
    source: DatingSource,
  ): Promise<{ pregnancy: Pregnancy; change: DatingChange }> {
    await this.consent.assertHealthDataConsent(owner);
    const today = await this.clock.today(owner);
    const dueDate = this.checkedDueDate(dating, today);
    const active = await this.requireActive(owner);
    const previousDueDate = toIsoDate(active.dueDate);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.pregnancyDating.create({
        data: {
          pregnancyId: active.id,
          method: dating.method,
          source,
          inputs: dating,
          dueDate: fromIsoDate(dueDate),
        },
      });
      // owner-scope: `active` is the owner's active pregnancy (ownerWhere)
      return tx.pregnancy.update({
        where: { id: active.id },
        data: {
          dueDate: fromIsoDate(dueDate),
          datingMethod: dating.method,
          datingSource: source,
        },
      });
    });
    return {
      pregnancy: toPregnancy(row, today),
      change: {
        previousDueDate,
        newDueDate: dueDate,
        shiftDays: daysBetween(previousDueDate, dueDate),
      },
    };
  }

  async datingHistory(owner: Owner) {
    const active = await this.requireActive(owner);
    const rows = await this.prisma.pregnancyDating.findMany({
      where: { pregnancyId: active.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      method: r.method,
      source: r.source,
      inputs: r.inputs as DatingInput,
      dueDate: toIsoDate(r.dueDate),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Ends the active pregnancy. Ending for a loss stops all pregnancy content at once;
   * a new pregnancy can be started afterwards.
   */
  async end(
    owner: Owner,
    outcome: PregnancyOutcome,
    endedOn: string,
  ): Promise<Pregnancy> {
    await this.consent.assertHealthDataConsent(owner);
    const today = await this.clock.today(owner);
    if (endedOn > today) {
      throw new BadRequestException(['endedOn cannot be in the future']);
    }
    const active = await this.requireActive(owner);
    // Gestation day 0 is the dating start (LMP-equivalent); nothing can end before it.
    if (gestationDays(toIsoDate(active.dueDate), endedOn) < 0) {
      throw new BadRequestException([
        'endedOn cannot be before the pregnancy began',
      ]);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      // owner-scope: `active` is the owner's active pregnancy (ownerWhere)
      const ended = await tx.pregnancy.update({
        where: { id: active.id },
        data: { status: 'ended', outcome, endedOn: fromIsoDate(endedOn) },
      });
      // Stop reminders that only make sense during a pregnancy. After a loss (or another
      // outcome) the symptom-journal reminder is paused too. The person can turn any of them
      // back on; nothing is deleted.
      const kinds =
        outcome === 'birth'
          ? ['readiness_checkin']
          : ['readiness_checkin', 'daily_log'];
      const paused = await tx.reminder.findMany({
        where: { ...ownerWhere(owner), enabled: true, kind: { in: kinds } },
        select: { id: true },
      });
      if (paused.length) {
        const ids = paused.map((r) => r.id);
        // owner-scope: ids come from the ownerWhere findMany just above
        await tx.reminder.updateMany({
          where: { id: { in: ids } },
          data: { enabled: false, nextRunAt: null },
        });
        await tx.reminderDelivery.updateMany({
          where: { reminderId: { in: ids }, status: 'pending' },
          data: { status: 'cancelled' },
        });
      }
      return ended;
    });
    return toPregnancy(row, today);
  }

  /** One week of the active pregnancy: its calendar dates, status and published guide. */
  async weekDetail(owner: Owner, week: number, locale: string) {
    const active = await this.requireActive(owner);
    const today = await this.clock.today(owner);
    const dueDate = toIsoDate(active.dueDate);
    const startDate = dateAtGestation(dueDate, week * 7);
    const endDate = dateAtGestation(dueDate, week * 7 + 6);
    const current = guideWeekFor(gestationDays(dueDate, today));
    return {
      week,
      trimester: trimesterFor(week * 7),
      startDate,
      endDate,
      status:
        week === current ? 'current' : week < current ? 'past' : 'upcoming',
      guide: await this.guides.published(week, locale),
    } as const;
  }

  async birthPreferences(owner: Owner): Promise<BirthPreferences> {
    const active = await this.requireActive(owner);
    const row = await this.prisma.birthPreferences.findUnique({
      where: { pregnancyId: active.id },
    });
    return toBirthPreferences(row);
  }

  async putBirthPreferences(
    owner: Owner,
    input: Omit<BirthPreferences, 'updatedAt'>,
  ): Promise<BirthPreferences> {
    await this.consent.assertHealthDataConsent(owner);
    const active = await this.requireActive(owner);
    const data = {
      birthSetting: input.birthSetting,
      painRelief: input.painRelief,
      supportPeople: input.supportPeople,
      feedingIntention: input.feedingIntention,
      notes: input.notes,
    };
    const row = await this.prisma.birthPreferences.upsert({
      where: { pregnancyId: active.id },
      create: { pregnancyId: active.id, ...data },
      update: data,
    });
    return toBirthPreferences(row);
  }

  async timeline(owner: Owner): Promise<Timeline> {
    const active = await this.requireActive(owner);
    return timelineFor(
      toIsoDate(active.dueDate),
      await this.clock.today(owner),
    );
  }

  /** Today's week and its published guide (null until that week is reviewed and published). */
  async thisWeek(
    owner: Owner,
    locale: string,
  ): Promise<{ pregnancy: Pregnancy; guide: WeekGuide | null }> {
    const pregnancy = await this.current(owner);
    return {
      pregnancy,
      guide: await this.guides.published(pregnancy.week, locale),
    };
  }

  private checkedDueDate(dating: DatingInput, today: string): string {
    const problems = datingProblems(dating, today);
    if (problems.length) {
      throw new BadRequestException({
        message: problems.map((p) => p.message),
        details: problems,
      });
    }
    return dueDateFrom(dating);
  }

  private findActive(owner: Owner) {
    return this.prisma.pregnancy.findFirst({
      where: { ...ownerWhere(owner), status: 'active' },
    });
  }

  private async requireActive(owner: Owner): Promise<PregnancyRow> {
    const active = await this.findActive(owner);
    if (!active) throw new NotFoundException('No active pregnancy.');
    return active;
  }
}

function toBirthPreferences(row: BirthPreferencesRow | null): BirthPreferences {
  return {
    birthSetting:
      (row?.birthSetting as BirthPreferences['birthSetting']) ?? null,
    painRelief: row?.painRelief ?? [],
    supportPeople: row?.supportPeople ?? [],
    feedingIntention:
      (row?.feedingIntention as BirthPreferences['feedingIntention']) ?? null,
    notes: row?.notes ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

function cleanDetails(d: PregnancyDetails) {
  return {
    firstPregnancy: d.firstPregnancy,
    fetusCount: d.fetusCount,
    confirmedByClinician: d.confirmedByClinician,
    restrictExercise: d.restrictExercise,
    foodRestrictions: d.foodRestrictions,
    clinicianNutritionPlan: d.clinicianNutritionPlan,
  };
}

export function toPregnancy(row: PregnancyRow, today: string): Pregnancy {
  const dueDate = toIsoDate(row.dueDate);
  // An ended pregnancy is described as of the day it ended.
  const asOf = row.endedOn ? toIsoDate(row.endedOn) : today;
  const days = gestationDays(dueDate, asOf);
  return {
    id: row.id,
    status: row.status,
    dueDate,
    datingMethod: row.datingMethod,
    datingSource: row.datingSource,
    today: asOf,
    gestationalAge: toGestationalAge(days),
    week: guideWeekFor(days),
    trimester: trimesterFor(Math.max(0, days)),
    termStatus: termStatusFor(days),
    daysUntilDue: daysBetween(asOf, dueDate),
    firstPregnancy: row.firstPregnancy,
    fetusCount: row.fetusCount,
    confirmedByClinician: row.confirmedByClinician,
    restrictExercise: row.restrictExercise,
    foodRestrictions: row.foodRestrictions,
    clinicianNutritionPlan: row.clinicianNutritionPlan,
    outcome: row.outcome,
    endedOn: row.endedOn ? toIsoDate(row.endedOn) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
