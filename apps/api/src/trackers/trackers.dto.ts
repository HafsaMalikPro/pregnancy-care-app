import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  Contraction,
  ContractionDay,
  KickSession,
  KickSummary,
  KickThreshold,
} from '@preconception/contracts';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../common/dates.js';

class AlertCtaDto {
  @ApiProperty() label: string;
  @ApiProperty({ enum: ['emergency', 'call_clinic'] }) kind:
    'emergency' | 'call_clinic';
}

class AlertDto {
  @ApiProperty() headline: string;
  @ApiProperty() message: string;
  @ApiProperty({ type: AlertCtaDto, nullable: true })
  callToAction: AlertCtaDto | null;
}

export class KickThresholdDto implements KickThreshold {
  @ApiProperty({ minimum: 1, maximum: 100 }) count: number;
  @ApiProperty({ minimum: 10, maximum: 720 }) windowMinutes: number;
  @ApiProperty({ enum: ['clinician'] }) source: 'clinician';
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class PutKickThresholdDto {
  @ApiProperty({
    minimum: 1,
    maximum: 100,
    description: 'Movements your clinician asked you to feel',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  count: number;

  @ApiProperty({
    minimum: 10,
    maximum: 720,
    description: 'Within this many minutes, as your clinician told you',
  })
  @IsInt()
  @Min(10)
  @Max(720)
  windowMinutes: number;
}

export class KickSessionDto implements KickSession {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ format: 'date-time' }) startedAt: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  endedAt: string | null;
  @ApiProperty() count: number;
  @ApiProperty({ nullable: true, type: Number }) durationSeconds: number | null;
  @ApiProperty({
    nullable: true,
    type: Boolean,
    description:
      'true: the clinician window passed with fewer movements. null: no threshold, running, or incomplete.',
  })
  belowThreshold: boolean | null;
  @ApiProperty({ type: AlertDto, nullable: true }) alert: AlertDto | null;
}

class KickDayDto {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ type: [KickSessionDto] }) sessions: KickSessionDto[];
  @ApiProperty() totalCount: number;
}

export class KickSummaryDto implements KickSummary {
  @ApiProperty({ type: KickThresholdDto, nullable: true })
  threshold: KickThresholdDto | null;
  @ApiProperty() thresholdLabel: string;
  @ApiProperty({ type: [KickDayDto] }) days: KickDayDto[];
  @ApiProperty() disclaimer: string;
}

export class DateRangeQuery {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() from: string;
  @ApiProperty({ format: 'date' }) @IsCalendarDate() to: string;
}

export class ContractionDto implements Contraction {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) startedAt: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  endedAt: string | null;
  @ApiProperty({ nullable: true, type: Number }) durationSeconds: number | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Start-to-start since the previous one that day',
  })
  intervalSeconds: number | null;
}

export class ContractionDayDto implements ContractionDay {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ type: [ContractionDto] }) contractions: ContractionDto[];
  @ApiProperty() count: number;
  @ApiProperty({ nullable: true, type: Number })
  averageDurationSeconds: number | null;
  @ApiProperty({ nullable: true, type: Number })
  averageIntervalSeconds: number | null;
  @ApiProperty({
    description: 'The standard "contact your maternity unit" message',
  })
  message: string;
}

export class StartContractionDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Default: now. Up to 12 hours in the past, for one recorded late; never in the future.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startedAt?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When it ended, if it is already over',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  endedAt?: string;
}

export class ContractionDayQuery {
  @ApiPropertyOptional({
    format: 'date',
    description: "Default: today in the profile's time zone",
  })
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
