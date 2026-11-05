import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ActivityLog, ExercisePlan } from '@preconception/contracts';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { fromIsoDate, toIsoDate } from '../common/dates.js';
import { OwnerClock } from '../common/owner-clock.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { ActivityLog as ActivityLogRow } from '../generated/prisma/client.js';
import { checkRange } from './nutrition.controller.js';
import { PersonalPlansService } from './personal-plans.service.js';
import {
  ActivityLogDto,
  ActivityLogParams,
  DateRangeQueryDto,
  ExercisePlanDto,
  PlanQueryDto,
  PutActivityLogDto,
} from './planning.dto.js';

@ApiTags('exercise')
@ApiOwnerAuth()
@Controller()
export class ExerciseController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PersonalPlansService,
    private readonly consent: ConsentService,
    private readonly clock: OwnerClock,
  ) {}

  @Get('me/exercise-plan')
  @ApiOperation({
    summary: 'Activities reviewed for my current week',
    description:
      'Published activities whose trimester and week range include your current week. If you told us a clinician asked you to limit exercise, no activities are offered (availability = clinician_guidance). Always returned with a disclaimer; not an exercise prescription.',
  })
  @ApiOkResponse({ type: ExercisePlanDto })
  @ApiErrors(400)
  plan(
    @CurrentOwner() owner: Owner,
    @Query() q: PlanQueryDto,
  ): Promise<ExercisePlan> {
    return this.plans.exercisePlan(owner, { date: q.date, locale: q.locale });
  }

  @Get('activity-logs')
  @ApiOperation({ summary: 'Activities I logged in a date range' })
  @ApiOkResponse({ type: [ActivityLogDto] })
  @ApiErrors(400)
  async logs(
    @CurrentOwner() owner: Owner,
    @Query() q: DateRangeQueryDto,
  ): Promise<ActivityLog[]> {
    checkRange(q.from, q.to);
    const rows = await this.prisma.activityLog.findMany({
      where: {
        ...ownerWhere(owner),
        date: { gte: fromIsoDate(q.from), lte: fromIsoDate(q.to) },
      },
      orderBy: [{ date: 'asc' }, { activitySlug: 'asc' }],
    });
    return rows.map(toLog);
  }

  @Put('activity-logs/:date/:activitySlug')
  @ApiOperation({
    summary: 'Mark an activity as done',
    description:
      'Idempotent per day and activity; repeating it updates the minutes. For your own record, not medical monitoring. The activity must be published. Requires health_data_processing consent. Future dates are rejected.',
  })
  @ApiOkResponse({ type: ActivityLogDto })
  @ApiErrors(400, 403, 404)
  async log(
    @CurrentOwner() owner: Owner,
    @Param() p: ActivityLogParams,
    @Body() dto: PutActivityLogDto,
  ): Promise<ActivityLog> {
    await this.consent.assertHealthDataConsent(owner);
    if (p.date > (await this.clock.today(owner))) {
      throw new BadRequestException(['date cannot be in the future']);
    }
    const published = await this.prisma.article.findFirst({
      where: { kind: 'activity', slug: p.activitySlug, status: 'published' },
      select: { id: true },
    });
    if (!published)
      throw new NotFoundException('No published activity with that slug.');

    const day = fromIsoDate(p.date);
    const minutes = dto.minutes ?? null;
    const row =
      owner.kind === 'user'
        ? await this.prisma.activityLog.upsert({
            where: {
              userId_date_activitySlug: {
                userId: owner.id,
                date: day,
                activitySlug: p.activitySlug,
              },
            },
            create: {
              userId: owner.id,
              date: day,
              activitySlug: p.activitySlug,
              minutes,
            },
            update: { minutes },
          })
        : await this.prisma.activityLog.upsert({
            where: {
              anonymousSessionId_date_activitySlug: {
                anonymousSessionId: owner.id,
                date: day,
                activitySlug: p.activitySlug,
              },
            },
            create: {
              anonymousSessionId: owner.id,
              date: day,
              activitySlug: p.activitySlug,
              minutes,
            },
            update: { minutes },
          });
    return toLog(row);
  }

  @Delete('activity-logs/:date/:activitySlug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unmark an activity' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiErrors(400, 404)
  async unlog(
    @CurrentOwner() owner: Owner,
    @Param() p: ActivityLogParams,
  ): Promise<void> {
    const { count } = await this.prisma.activityLog.deleteMany({
      where: {
        ...ownerWhere(owner),
        date: fromIsoDate(p.date),
        activitySlug: p.activitySlug,
      },
    });
    if (count === 0) throw new NotFoundException('No such activity log.');
  }
}

function toLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    activitySlug: row.activitySlug,
    minutes: row.minutes,
    createdAt: row.createdAt.toISOString(),
  };
}
