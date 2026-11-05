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
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  type DailyLog,
  MoodCode,
  NOTE_MAX_LENGTH,
  SymptomCode,
} from '@preconception/contracts';
import { daysBetween } from '@preconception/utils';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { fromIsoDate, IsCalendarDate, toIsoDate } from '../common/dates.js';
import { OwnerClock } from '../common/owner-clock.js';
import { ParseCalendarDatePipe } from '../common/pipes.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { DailyLog as DailyLogRow } from '../generated/prisma/client.js';

const MAX_RANGE_DAYS = 366;

class RangeQueryDto {
  @ApiProperty({ format: 'date', example: '2026-10-01' })
  @IsCalendarDate()
  from: string;

  @ApiProperty({
    format: 'date',
    example: '2026-10-31',
    description: `Inclusive; at most ${MAX_RANGE_DAYS} days after from`,
  })
  @IsCalendarDate()
  to: string;
}

class PutDailyLogDto {
  @ApiProperty({
    enum: SymptomCode.options,
    isArray: true,
    example: ['cramps', 'fatigue'],
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(SymptomCode.options.length)
  @IsIn(SymptomCode.options, { each: true })
  symptoms: SymptomCode[];

  @ApiPropertyOptional({
    nullable: true,
    maxLength: NOTE_MAX_LENGTH,
    description: 'Private free text. Never logged.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string | null;

  // The fields below are optional for older clients: when omitted, the saved value is kept;
  // send null to clear it.

  @ApiPropertyOptional({ enum: MoodCode.options, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(MoodCode.options)
  mood?: MoodCode | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 1440 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1440)
  sleepMinutes?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    maximum: 40,
    description:
      'Glasses of water or other drinks, as counted by the user. No target is set.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(40)
  waterGlasses?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 1440 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1440)
  activityMinutes?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: NOTE_MAX_LENGTH,
    description: 'Questions to ask a clinician. Private; never logged.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  questions?: string | null;
}

class DailyLogDto implements DailyLog {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ enum: SymptomCode.options, isArray: true })
  symptoms: SymptomCode[];
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty({ enum: MoodCode.options, nullable: true, type: String })
  mood: MoodCode | null;
  @ApiProperty({ nullable: true, type: Number }) sleepMinutes: number | null;
  @ApiProperty({ nullable: true, type: Number }) waterGlasses: number | null;
  @ApiProperty({ nullable: true, type: Number }) activityMinutes: number | null;
  @ApiProperty({ nullable: true, type: String }) questions: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

@ApiTags('daily-logs')
@ApiOwnerAuth()
@Controller('daily-logs')
export class DailyLogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly clock: OwnerClock,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Logs in a date range, oldest first' })
  @ApiOkResponse({ type: [DailyLogDto] })
  @ApiErrors(400)
  async list(
    @CurrentOwner() owner: Owner,
    @Query() q: RangeQueryDto,
  ): Promise<DailyLog[]> {
    const span = daysBetween(q.from, q.to);
    if (span < 0)
      throw new BadRequestException(['to must be on or after from']);
    if (span > MAX_RANGE_DAYS) {
      throw new BadRequestException([
        `to must be at most ${MAX_RANGE_DAYS} days after from`,
      ]);
    }
    const rows = await this.prisma.dailyLog.findMany({
      where: {
        ...ownerWhere(owner),
        date: { gte: fromIsoDate(q.from), lte: fromIsoDate(q.to) },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map(toDto);
  }

  @Get(':date')
  @ApiParam({ name: 'date', format: 'date' })
  @ApiOperation({ summary: 'Log for one day' })
  @ApiOkResponse({ type: DailyLogDto })
  @ApiErrors(400, 404)
  async get(
    @CurrentOwner() owner: Owner,
    @Param('date', ParseCalendarDatePipe) date: string,
  ): Promise<DailyLog> {
    const row = await this.prisma.dailyLog.findFirst({
      where: { ...ownerWhere(owner), date: fromIsoDate(date) },
    });
    if (!row) throw new NotFoundException('No log for this date.');
    return toDto(row);
  }

  @Put(':date')
  @ApiParam({ name: 'date', format: 'date' })
  @ApiOperation({
    summary: 'Create or replace the log for one day',
    description:
      'Requires health_data_processing consent. Future dates are rejected. `symptoms` and `note` are replaced; mood, sleep, water, activity and questions keep their saved value when omitted (send null to clear).',
  })
  @ApiOkResponse({ type: DailyLogDto })
  @ApiErrors(400, 403)
  async put(
    @CurrentOwner() owner: Owner,
    @Param('date', ParseCalendarDatePipe) date: string,
    @Body() dto: PutDailyLogDto,
  ): Promise<DailyLog> {
    await this.consent.assertHealthDataConsent(owner);
    if (date > (await this.clock.today(owner))) {
      throw new BadRequestException(['date cannot be in the future']);
    }
    const data = {
      symptoms: dto.symptoms,
      note: dto.note ?? null,
      ...(dto.mood !== undefined && { mood: dto.mood }),
      ...(dto.sleepMinutes !== undefined && { sleepMinutes: dto.sleepMinutes }),
      ...(dto.waterGlasses !== undefined && { waterGlasses: dto.waterGlasses }),
      ...(dto.activityMinutes !== undefined && {
        activityMinutes: dto.activityMinutes,
      }),
      ...(dto.questions !== undefined && { questions: dto.questions }),
    };
    const day = fromIsoDate(date);
    const row =
      owner.kind === 'user'
        ? await this.prisma.dailyLog.upsert({
            where: { userId_date: { userId: owner.id, date: day } },
            create: { userId: owner.id, date: day, ...data },
            update: data,
          })
        : await this.prisma.dailyLog.upsert({
            where: {
              anonymousSessionId_date: {
                anonymousSessionId: owner.id,
                date: day,
              },
            },
            create: { anonymousSessionId: owner.id, date: day, ...data },
            update: data,
          });
    return toDto(row);
  }

  @Delete(':date')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'date', format: 'date' })
  @ApiOperation({ summary: 'Delete the log for one day' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param('date', ParseCalendarDatePipe) date: string,
  ): Promise<void> {
    const { count } = await this.prisma.dailyLog.deleteMany({
      where: { ...ownerWhere(owner), date: fromIsoDate(date) },
    });
    if (count === 0) throw new NotFoundException('No log for this date.');
  }
}

function toDto(row: DailyLogRow): DailyLog {
  return {
    date: toIsoDate(row.date),
    symptoms: row.symptoms as SymptomCode[],
    note: row.note,
    mood: (row.mood as MoodCode | null) ?? null,
    sleepMinutes: row.sleepMinutes,
    waterGlasses: row.waterGlasses,
    activityMinutes: row.activityMinutes,
    questions: row.questions,
    updatedAt: row.updatedAt.toISOString(),
  };
}
