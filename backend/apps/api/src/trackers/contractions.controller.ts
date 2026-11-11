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
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Contraction, ContractionDay } from '@preconception/contracts';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { fromIsoDate } from '../common/dates.js';
import { OwnerClock } from '../common/owner-clock.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ThrottleWrite } from '../common/throttle.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { contractionDay } from './trackers.js';
import {
  ContractionDayDto,
  ContractionDayQuery,
  ContractionDto,
  StartContractionDto,
} from './trackers.dto.js';

const MAX_PER_DAY = 300;
const BACKDATE_LIMIT_MS = 12 * 3_600_000;
/** Allowance for clock skew between the device and the server. */
const FUTURE_SKEW_MS = 60_000;

@ApiTags('trackers')
@ApiOwnerAuth()
@Controller('contractions')
export class ContractionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly clock: OwnerClock,
  ) {}

  @Get()
  @ApiOperation({
    summary: "A day's contractions with durations and intervals",
    description:
      'Computes duration and start-to-start interval only. The response carries one standard message ("contact your maternity unit"); no other advice is given.',
  })
  @ApiOkResponse({ type: ContractionDayDto })
  @ApiErrors(400)
  async day(
    @CurrentOwner() owner: Owner,
    @Query() q: ContractionDayQuery,
  ): Promise<ContractionDay> {
    const date = q.date ?? (await this.clock.today(owner));
    const rows = await this.prisma.contraction.findMany({
      where: { ...ownerWhere(owner), date: fromIsoDate(date) },
      orderBy: { startedAt: 'asc' },
    });
    return contractionDay(date, rows);
  }

  @Post()
  @ThrottleWrite('trackerSession')
  @ApiOperation({
    summary: 'Record a contraction (start now, or a finished one)',
    description:
      'Without a body it starts now. Times may be up to 12 hours in the past and never in the future. Requires health_data_processing consent. 409 for a duplicate start time.',
  })
  @ApiCreatedResponse({ type: ContractionDto })
  @ApiErrors(400, 403, 409)
  async start(
    @CurrentOwner() owner: Owner,
    @Body() dto: StartContractionDto,
  ): Promise<Contraction> {
    await this.consent.assertHealthDataConsent(owner);
    const now = Date.now();
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date(now);
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
    const errors: string[] = [];
    if (startedAt.getTime() > now + FUTURE_SKEW_MS) {
      errors.push('startedAt cannot be in the future');
    }
    if (startedAt.getTime() < now - BACKDATE_LIMIT_MS) {
      errors.push('startedAt can be at most 12 hours ago');
    }
    if (endedAt && endedAt.getTime() > now + FUTURE_SKEW_MS) {
      errors.push('endedAt cannot be in the future');
    }
    if (endedAt && endedAt < startedAt) {
      errors.push('endedAt must not be before startedAt');
    }
    if (errors.length) throw new BadRequestException(errors);

    const date = await this.clock.today(owner, startedAt);
    const [onDay, pregnancy] = await Promise.all([
      this.prisma.contraction.count({
        where: { ...ownerWhere(owner), date: fromIsoDate(date) },
      }),
      this.prisma.pregnancy.findFirst({
        where: { ...ownerWhere(owner), status: 'active' },
        select: { id: true },
      }),
    ]);
    if (onDay >= MAX_PER_DAY) {
      throw new ConflictException(
        `At most ${MAX_PER_DAY} contractions a day can be recorded.`,
      );
    }
    const row = await this.prisma.contraction.create({
      data: {
        ...ownerWhere(owner),
        pregnancyId: pregnancy?.id ?? null,
        date: fromIsoDate(date),
        startedAt,
        endedAt,
      },
    });
    return this.withContext(owner, date, row.id);
  }

  @ThrottleWrite('ownerWrite')
  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop a running contraction',
    description: 'Stopping twice keeps the first end time.',
  })
  @ApiOkResponse({ type: ContractionDto })
  @ApiErrors(400, 403, 404)
  async stop(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Contraction> {
    await this.consent.assertHealthDataConsent(owner);
    await this.prisma.contraction.updateMany({
      where: { id, ...ownerWhere(owner), endedAt: null },
      data: { endedAt: new Date() },
    });
    const row = await this.prisma.contraction.findFirst({
      where: { id, ...ownerWhere(owner) },
    });
    if (!row) throw new NotFoundException('Contraction not found.');
    return this.withContext(owner, row.date.toISOString().slice(0, 10), row.id);
  }

  @ThrottleWrite('ownerWrite')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contraction' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const { count } = await this.prisma.contraction.deleteMany({
      where: { id, ...ownerWhere(owner) },
    });
    if (count === 0) throw new NotFoundException('Contraction not found.');
  }

  /** One contraction with its interval, computed against the rest of its day. */
  private async withContext(
    owner: Owner,
    date: string,
    id: string,
  ): Promise<Contraction> {
    const rows = await this.prisma.contraction.findMany({
      where: { ...ownerWhere(owner), date: fromIsoDate(date) },
    });
    return contractionDay(date, rows).contractions.find((c) => c.id === id)!;
  }
}
