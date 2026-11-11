import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  KickSession,
  KickSummary,
  KickThreshold,
} from '@preconception/contracts';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { addDays, fromIsoDate, toIsoDate } from '../common/dates.js';
import {
  type ActivePregnancy,
  PregnancyContext,
} from '../common/pregnancy-context.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ThrottleWrite } from '../common/throttle.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Pregnancy as PregnancyRow } from '../generated/prisma/client.js';
import { toKickSession, TRACKER_TEXT } from './trackers.js';
import {
  DateRangeQuery,
  KickSessionDto,
  KickSummaryDto,
  KickThresholdDto,
  PutKickThresholdDto,
} from './trackers.dto.js';

/** Kick counting is offered from the start of the third trimester. */
const THIRD_TRIMESTER = 3;
const MAX_SESSIONS_PER_DAY = 20;
const MAX_RANGE_DAYS = 92;
const MAX_COUNT = 500;

function thresholdOf(p: PregnancyRow): KickThreshold | null {
  if (p.kickThresholdCount === null || p.kickThresholdMinutes === null) {
    return null;
  }
  return {
    count: p.kickThresholdCount,
    windowMinutes: p.kickThresholdMinutes,
    source: 'clinician',
    updatedAt: (p.kickThresholdUpdatedAt ?? p.updatedAt).toISOString(),
  };
}

@ApiTags('trackers')
@ApiOwnerAuth()
@Controller('kick-counts')
export class KickCountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly pregnancy: PregnancyContext,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Kick-count sessions by day, with the clinician-set threshold',
    description:
      'Range of at most 92 days. Sessions are compared with the threshold only when one is set.',
  })
  @ApiOkResponse({ type: KickSummaryDto })
  @ApiErrors(400, 404)
  async summary(
    @CurrentOwner() owner: Owner,
    @Query() q: DateRangeQuery,
  ): Promise<KickSummary> {
    if (q.to < q.from)
      throw new BadRequestException(['to must not be before from']);
    if (addDays(q.from, MAX_RANGE_DAYS) < q.to) {
      throw new BadRequestException([
        `range must be at most ${MAX_RANGE_DAYS} days`,
      ]);
    }
    const active = await this.requirePregnancy(owner);
    const threshold = thresholdOf(active.row);
    const rows = await this.prisma.kickSession.findMany({
      where: {
        ...ownerWhere(owner),
        pregnancyId: active.row.id,
        date: { gte: fromIsoDate(q.from), lte: fromIsoDate(q.to) },
      },
      orderBy: { startedAt: 'asc' },
    });
    const byDate = new Map<string, KickSession[]>();
    for (const r of rows) {
      const date = toIsoDate(r.date);
      const list = byDate.get(date) ?? [];
      list.push(toKickSession({ ...r, date }, threshold));
      byDate.set(date, list);
    }
    return {
      threshold,
      thresholdLabel: TRACKER_TEXT.kickThresholdLabel,
      days: [...byDate.entries()].map(([date, sessions]) => ({
        date,
        sessions,
        totalCount: sessions.reduce((n, s) => n + s.count, 0),
      })),
      disclaimer: TRACKER_TEXT.kickDisclaimer,
    };
  }

  @ThrottleWrite('ownerWrite')
  @Put('threshold')
  @ApiOperation({
    summary: 'Save the threshold your clinician gave you',
    description:
      'The app never proposes a value. Requires health_data_processing consent and an active pregnancy.',
  })
  @ApiOkResponse({ type: KickThresholdDto })
  @ApiErrors(400, 403, 404)
  async setThreshold(
    @CurrentOwner() owner: Owner,
    @Body() dto: PutKickThresholdDto,
  ): Promise<KickThreshold> {
    await this.consent.assertHealthDataConsent(owner);
    const active = await this.requirePregnancy(owner);
    // owner-scope: `active` is the owner's active pregnancy (ownerWhere)
    const row = await this.prisma.pregnancy.update({
      where: { id: active.row.id },
      data: {
        kickThresholdCount: dto.count,
        kickThresholdMinutes: dto.windowMinutes,
        kickThresholdUpdatedAt: new Date(),
      },
    });
    return thresholdOf(row)!;
  }

  @ThrottleWrite('ownerWrite')
  @Delete('threshold')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the threshold' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiErrors(404)
  async clearThreshold(@CurrentOwner() owner: Owner): Promise<void> {
    const active = await this.requirePregnancy(owner);
    // owner-scope: `active` is the owner's active pregnancy (ownerWhere)
    await this.prisma.pregnancy.update({
      where: { id: active.row.id },
      data: {
        kickThresholdCount: null,
        kickThresholdMinutes: null,
        kickThresholdUpdatedAt: new Date(),
      },
    });
  }

  @Post('sessions')
  @ThrottleWrite('trackerSession')
  @ApiOperation({
    summary: 'Start a kick-count session',
    description:
      'Third trimester only (409 before). One running session at a time (409). Requires health_data_processing consent.',
  })
  @ApiCreatedResponse({ type: KickSessionDto })
  @ApiErrors(403, 404, 409)
  async start(@CurrentOwner() owner: Owner): Promise<KickSession> {
    await this.consent.assertHealthDataConsent(owner);
    const active = await this.requirePregnancy(owner);
    if (active.trimester < THIRD_TRIMESTER) {
      throw new ConflictException(
        'Kick counting is offered from the third trimester (week 28).',
      );
    }
    const today = fromIsoDate(active.today);
    const [running, todayCount] = await Promise.all([
      this.prisma.kickSession.findFirst({
        where: { ...ownerWhere(owner), endedAt: null },
      }),
      this.prisma.kickSession.count({
        where: { ...ownerWhere(owner), date: today },
      }),
    ]);
    if (running) throw new ConflictException('A session is already running.');
    if (todayCount >= MAX_SESSIONS_PER_DAY) {
      throw new ConflictException(
        `At most ${MAX_SESSIONS_PER_DAY} sessions a day can be recorded.`,
      );
    }
    const row = await this.prisma.kickSession.create({
      data: {
        ...ownerWhere(owner),
        pregnancyId: active.row.id,
        date: today,
        startedAt: new Date(),
      },
    });
    return toKickSession(
      { ...row, date: active.today },
      thresholdOf(active.row),
    );
  }

  @ThrottleWrite('ownerWrite')
  @Post('sessions/:id/kicks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Count one movement',
    description: 'Only while the session runs (409 after it stopped).',
  })
  @ApiOkResponse({ type: KickSessionDto })
  @ApiErrors(400, 403, 404, 409)
  async kick(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KickSession> {
    await this.consent.assertHealthDataConsent(owner);
    const active = await this.requirePregnancy(owner);
    // Atomic increment of a running session the caller owns.
    const { count } = await this.prisma.kickSession.updateMany({
      where: {
        id,
        ...ownerWhere(owner),
        endedAt: null,
        count: { lt: MAX_COUNT },
      },
      data: { count: { increment: 1 } },
    });
    const row = await this.find(owner, id);
    if (count === 0) {
      throw new ConflictException(
        row.endedAt ? 'This session has stopped.' : 'Count limit reached.',
      );
    }
    return toKickSession(
      { ...row, date: toIsoDate(row.date) },
      thresholdOf(active.row),
    );
  }

  @ThrottleWrite('ownerWrite')
  @Post('sessions/:id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop a session',
    description:
      'Returns the session compared with the threshold; `alert` is set when the count is below it. Stopping twice returns the same result.',
  })
  @ApiOkResponse({ type: KickSessionDto })
  @ApiErrors(400, 403, 404)
  async stop(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<KickSession> {
    await this.consent.assertHealthDataConsent(owner);
    const active = await this.requirePregnancy(owner);
    await this.prisma.kickSession.updateMany({
      where: { id, ...ownerWhere(owner), endedAt: null },
      data: { endedAt: new Date() },
    });
    const row = await this.find(owner, id);
    return toKickSession(
      { ...row, date: toIsoDate(row.date) },
      thresholdOf(active.row),
    );
  }

  @ThrottleWrite('ownerWrite')
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a session' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const { count } = await this.prisma.kickSession.deleteMany({
      where: { id, ...ownerWhere(owner) },
    });
    if (count === 0) throw new NotFoundException('Session not found.');
  }

  private async requirePregnancy(owner: Owner): Promise<ActivePregnancy> {
    const active = await this.pregnancy.active(owner);
    if (!active) throw new NotFoundException('No active pregnancy.');
    return active;
  }

  /** Owner-scoped: someone else's id reads as missing. */
  private async find(owner: Owner, id: string) {
    const row = await this.prisma.kickSession.findFirst({
      where: { id, ...ownerWhere(owner) },
    });
    if (!row) throw new NotFoundException('Session not found.');
    return row;
  }
}
