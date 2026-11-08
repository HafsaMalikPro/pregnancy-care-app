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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { WeightEntry, WeightTrend } from '@preconception/contracts';
import { IsNumber, Max, Min } from 'class-validator';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import {
  addDays,
  fromIsoDate,
  IsCalendarDate,
  toIsoDate,
} from '../common/dates.js';
import { OwnerClock } from '../common/owner-clock.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { WeightEntry as WeightRow } from '../generated/prisma/client.js';

const MAX_RANGE_DAYS = 366;

/** Shown with every trend. No target, healthy range or ideal is ever computed. */
export const WEIGHT_NOTE =
  "This shows your own entries over time only. The app doesn't set a target or a healthy range and never compares your weight with anyone else's. Talk to your clinician about weight in pregnancy.";

class WeightEntryDto implements WeightEntry {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ minimum: 20, maximum: 300 }) weightKg: number;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

class WeightTrendDto implements WeightTrend {
  @ApiProperty({ description: 'The opt-in setting on the profile' })
  enabled: boolean;
  @ApiProperty({ type: [WeightEntryDto] }) entries: WeightEntryDto[];
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Last minus first entry in the range (kg). No target.',
  })
  changeKg: number | null;
  @ApiProperty() note: string;
}

class WeightRangeQuery {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() from: string;
  @ApiProperty({ format: 'date' }) @IsCalendarDate() to: string;
}

class WeightDateParam {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() date: string;
}

class PutWeightDto {
  @ApiProperty({ minimum: 20, maximum: 300, example: 64.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20)
  @Max(300)
  weightKg: number;
}

const toEntry = (r: WeightRow): WeightEntry => ({
  date: toIsoDate(r.date),
  weightKg: Number(r.weightKg),
  updatedAt: r.updatedAt.toISOString(),
});

@ApiTags('weight')
@ApiOwnerAuth()
@Controller('weight-entries')
export class WeightController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly clock: OwnerClock,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'My weight entries and trend (opt-in)',
    description:
      'Entries in a range of at most a year, oldest first. Entries saved earlier stay readable after opting out.',
  })
  @ApiOkResponse({ type: WeightTrendDto })
  @ApiErrors(400)
  async trend(
    @CurrentOwner() owner: Owner,
    @Query() q: WeightRangeQuery,
  ): Promise<WeightTrend> {
    if (q.to < q.from)
      throw new BadRequestException(['to must not be before from']);
    if (addDays(q.from, MAX_RANGE_DAYS) < q.to) {
      throw new BadRequestException(['range must be at most a year']);
    }
    const [profile, rows] = await Promise.all([
      this.prisma.profile.findFirst({
        where: ownerWhere(owner),
        select: { weightTrackingEnabled: true },
      }),
      this.prisma.weightEntry.findMany({
        where: {
          ...ownerWhere(owner),
          date: { gte: fromIsoDate(q.from), lte: fromIsoDate(q.to) },
        },
        orderBy: { date: 'asc' },
      }),
    ]);
    const entries = rows.map(toEntry);
    const changeKg =
      entries.length >= 2
        ? Math.round(
            (entries[entries.length - 1].weightKg - entries[0].weightKg) * 100,
          ) / 100
        : null;
    return {
      enabled: profile?.weightTrackingEnabled ?? false,
      entries,
      changeKg,
      note: WEIGHT_NOTE,
    };
  }

  @Put(':date')
  @ApiOperation({
    summary: 'Save the weight for a day',
    description:
      'Only after opting in (`weightTrackingEnabled` on the profile; 409 otherwise). Requires health_data_processing consent. Future dates are rejected.',
  })
  @ApiOkResponse({ type: WeightEntryDto })
  @ApiErrors(400, 403, 409)
  async put(
    @CurrentOwner() owner: Owner,
    @Param() p: WeightDateParam,
    @Body() dto: PutWeightDto,
  ): Promise<WeightEntry> {
    await this.consent.assertHealthDataConsent(owner);
    const profile = await this.prisma.profile.findFirst({
      where: ownerWhere(owner),
      select: { weightTrackingEnabled: true },
    });
    if (!profile?.weightTrackingEnabled) {
      throw new ConflictException(
        'Weight tracking is off. Turn it on in your profile first.',
      );
    }
    if (p.date > (await this.clock.today(owner))) {
      throw new BadRequestException(['date cannot be in the future']);
    }
    const where = { ...ownerWhere(owner), date: fromIsoDate(p.date) };
    const existing = await this.prisma.weightEntry.findFirst({ where });
    const row = existing
      ? await this.prisma.weightEntry.update({
          where: { id: existing.id },
          data: { weightKg: dto.weightKg },
        })
      : await this.prisma.weightEntry.create({
          data: { ...where, weightKg: dto.weightKg },
        });
    return toEntry(row);
  }

  @Delete(':date')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the weight for a day' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param() p: WeightDateParam,
  ): Promise<void> {
    const { count } = await this.prisma.weightEntry.deleteMany({
      where: { ...ownerWhere(owner), date: fromIsoDate(p.date) },
    });
    if (count === 0) throw new NotFoundException('No entry for that date.');
  }
}
