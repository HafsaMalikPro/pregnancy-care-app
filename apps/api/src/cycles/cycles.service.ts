import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CycleEntry,
  CycleEstimate,
  PageInfo,
} from '@preconception/contracts';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { fromIsoDate, toIsoDate } from '../common/dates.js';
import { OwnerClock } from '../common/owner-clock.js';
import { type PageQueryDto, pageInfo } from '../common/pagination.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Cycle } from '../generated/prisma/client.js';
import { estimateNextPeriod } from './estimate.js';

export interface CycleInput {
  periodStart: string;
  periodEnd?: string | null;
}

/** Overlaps (409) and invalid ranges (400) are enforced by database constraints too. */
@Injectable()
export class CyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly clock: OwnerClock,
  ) {}

  async list(
    owner: Owner,
    query: PageQueryDto,
  ): Promise<{ items: CycleEntry[]; page: PageInfo }> {
    const where = ownerWhere(owner);
    const [rows, total] = await Promise.all([
      this.prisma.cycle.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.cycle.count({ where }),
    ]);
    return { items: rows.map(toEntry), page: pageInfo(query, total) };
  }

  async get(owner: Owner, id: string): Promise<CycleEntry> {
    return toEntry(await this.find(owner, id));
  }

  async create(owner: Owner, input: CycleInput): Promise<CycleEntry> {
    await this.consent.assertHealthDataConsent(owner);
    await this.assertValid(owner, input.periodStart, input.periodEnd ?? null);
    const row = await this.prisma.cycle.create({
      data: {
        ...ownerWhere(owner),
        periodStart: fromIsoDate(input.periodStart),
        periodEnd: input.periodEnd ? fromIsoDate(input.periodEnd) : null,
      },
    });
    return toEntry(row);
  }

  async update(
    owner: Owner,
    id: string,
    input: Partial<CycleInput>,
  ): Promise<CycleEntry> {
    await this.consent.assertHealthDataConsent(owner);
    const existing = await this.find(owner, id);
    const periodStart = input.periodStart ?? toIsoDate(existing.periodStart);
    const periodEnd =
      input.periodEnd !== undefined
        ? input.periodEnd
        : existing.periodEnd && toIsoDate(existing.periodEnd);
    await this.assertValid(owner, periodStart, periodEnd);
    // owner-scope: `existing` was found with ownerWhere above
    const row = await this.prisma.cycle.update({
      where: { id: existing.id },
      data: {
        periodStart: fromIsoDate(periodStart),
        periodEnd: periodEnd ? fromIsoDate(periodEnd) : null,
      },
    });
    return toEntry(row);
  }

  async remove(owner: Owner, id: string): Promise<void> {
    const { count } = await this.prisma.cycle.deleteMany({
      where: { id, ...ownerWhere(owner) },
    });
    if (count === 0) throw new NotFoundException('Cycle not found.');
  }

  async estimate(owner: Owner): Promise<CycleEstimate> {
    const rows = await this.prisma.cycle.findMany({
      where: ownerWhere(owner),
      orderBy: { periodStart: 'desc' },
      take: 7,
      select: { periodStart: true },
    });
    return estimateNextPeriod(
      rows.map((r) => toIsoDate(r.periodStart)),
      await this.clock.today(owner),
    );
  }

  /** Scoped lookup: someone else's id is indistinguishable from a missing one (404). */
  private async find(owner: Owner, id: string): Promise<Cycle> {
    const row = await this.prisma.cycle.findFirst({
      where: { id, ...ownerWhere(owner) },
    });
    if (!row) throw new NotFoundException('Cycle not found.');
    return row;
  }

  private async assertValid(owner: Owner, start: string, end: string | null) {
    const today = await this.clock.today(owner);
    const errors: string[] = [];
    if (start > today) errors.push('periodStart cannot be in the future');
    if (end && end > today) errors.push('periodEnd cannot be in the future');
    if (end && end < start)
      errors.push('periodEnd must be on or after periodStart');
    if (errors.length) throw new BadRequestException(errors);
  }
}

function toEntry(row: Cycle): CycleEntry {
  return {
    id: row.id,
    periodStart: toIsoDate(row.periodStart),
    periodEnd: row.periodEnd ? toIsoDate(row.periodEnd) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
