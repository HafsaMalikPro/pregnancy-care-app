import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  CheckSymptomCode,
  RedFlagCode,
  SymptomCode,
  type SymptomCheckOptions,
  type SymptomCheckResult,
  type TriageLevel,
  TriageStage,
} from '@preconception/contracts';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
} from 'class-validator';
import {
  CurrentOwner,
  MaybeOwner,
  OptionalAuth,
  Public,
} from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { fromIsoDate, IsCalendarDate, toIsoDate } from '../common/dates.js';
import { JourneyStage } from '../common/journey-stage.js';
import { ApiErrors, ApiOwnerAuth, SECURITY } from '../common/swagger.js';
import { ThrottleWrite } from '../common/throttle.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { todayInZone } from '@preconception/utils';
import type { SymptomCheck as SymptomCheckRow } from '../generated/prisma/client.js';
import { redFlagsFor, TRIAGE_RULES, triage } from './triage.js';

const CHECK_CODES = [...RedFlagCode.options, ...SymptomCode.options];
const MAX_RANGE_DAYS = 366;

class ReviewDto {
  @ApiProperty() reviewerCredentials: string;
  @ApiProperty({ format: 'date' }) reviewedAt: string;
}

class CallToActionDto {
  @ApiProperty() label: string;
  @ApiProperty({ enum: ['emergency', 'call_clinic'] }) kind:
    'emergency' | 'call_clinic';
}

class RedFlagDto {
  @ApiProperty({ enum: RedFlagCode.options }) code: RedFlagCode;
  @ApiProperty() label: string;
}

class RedFlagOptionDto extends RedFlagDto {
  @ApiProperty({ enum: TriageStage.options, isArray: true })
  stages: TriageStage[];
}

class SourceDto {
  @ApiProperty() title: string;
  @ApiProperty() url: string;
}

export class SymptomCheckOptionsDto implements SymptomCheckOptions {
  @ApiProperty() rulesVersion: string;
  @ApiProperty({
    type: ReviewDto,
    nullable: true,
    description: 'Null: show "Not yet clinically reviewed"',
  })
  review: ReviewDto | null;
  @ApiProperty({ type: [RedFlagOptionDto] }) redFlags: RedFlagOptionDto[];
  @ApiProperty({ enum: SymptomCode.options, isArray: true })
  everyday: SymptomCode[];
  @ApiProperty({ type: CallToActionDto })
  emergencyCallToAction: { label: string; kind: 'emergency' };
  @ApiProperty() disclaimer: string;
}

export class SymptomCheckResultDto implements SymptomCheckResult {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  id: string | null;
  @ApiProperty({
    description:
      'Whether it was stored in the journal. The result is returned either way.',
  })
  saved: boolean;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ enum: CHECK_CODES, isArray: true })
  symptoms: CheckSymptomCode[];
  @ApiProperty({ enum: ['routine', 'call_clinic_today', 'emergency'] })
  level: TriageLevel;
  @ApiProperty() headline: string;
  @ApiProperty() message: string;
  @ApiProperty({
    type: CallToActionDto,
    nullable: true,
    description: 'Shown first, immediately. Null only for routine.',
  })
  callToAction: CallToActionDto | null;
  @ApiProperty({ type: [String] }) matchedRules: string[];
  @ApiProperty({ type: [RedFlagDto] }) redFlags: RedFlagDto[];
  @ApiProperty({ enum: TriageStage.options }) stage: TriageStage;
  @ApiProperty() rulesVersion: string;
  @ApiProperty({ type: ReviewDto, nullable: true }) review: ReviewDto | null;
  @ApiProperty({ type: [SourceDto] }) sources: SourceDto[];
  @ApiProperty() disclaimer: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class SymptomCheckOptionsQuery {
  @ApiPropertyOptional({
    enum: TriageStage.options,
    description:
      'Which warning signs to offer. Default unknown (all of them). Signed-in callers can omit it.',
  })
  @IsOptional()
  @IsIn(TriageStage.options)
  stage?: TriageStage;
}

export class CreateSymptomCheckDto {
  @ApiProperty({
    enum: CHECK_CODES,
    isArray: true,
    description:
      'Red-flag codes and/or everyday journal symptom codes (fixed vocabulary).',
    example: ['severe_headache', 'nausea'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsIn(CHECK_CODES, { each: true })
  symptoms: CheckSymptomCode[];
}

export class SymptomCheckRangeQuery {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() from: string;
  @ApiProperty({ format: 'date' }) @IsCalendarDate() to: string;
}

@ApiTags('symptoms')
@Controller('symptom-checks')
export class SymptomChecksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly journey: JourneyStage,
  ) {}

  @Get('options')
  @Public('The warning-sign vocabulary must be readable without an account')
  @ApiOperation({
    summary: 'Warning signs and wording for the red-flag screen',
    description:
      'Public. From the version-controlled rules file. `review` is null until a clinician has reviewed this rules version: clients must then show "Not yet clinically reviewed".',
  })
  @ApiOkResponse({ type: SymptomCheckOptionsDto })
  @ApiErrors(400)
  options(@Query() q: SymptomCheckOptionsQuery): SymptomCheckOptions {
    const rules = TRIAGE_RULES;
    return {
      rulesVersion: rules.version,
      review: rules.review,
      redFlags: redFlagsFor(q.stage ?? 'unknown').map((s) => ({
        code: s.code,
        label: s.label,
        stages: s.stages,
      })),
      everyday: [...SymptomCode.options],
      emergencyCallToAction: {
        label: rules.levels.emergency.callToAction!.label,
        kind: 'emergency',
      },
      disclaimer: rules.disclaimer,
    };
  }

  @Post()
  @OptionalAuth(
    'An emergency triage result must never depend on having an account or consent',
  )
  @ApiBearerAuth(SECURITY.bearer)
  @ApiCookieAuth(SECURITY.cookie)
  @ApiSecurity(SECURITY.anonymous)
  @ApiSecurity({})
  @HttpCode(HttpStatus.OK)
  @ThrottleWrite('symptomCheck')
  @ApiOperation({
    summary: 'Check symptoms against the warning-sign rules',
    description:
      'Rule-based triage (routine, call_clinic_today, emergency) from a fixed list; never a diagnosis. Any selected red flag escalates whatever the stage. The result is always returned. It is saved to the journal only for a signed-in owner with health_data_processing consent (`saved`).',
  })
  @ApiOkResponse({ type: SymptomCheckResultDto })
  @ApiErrors(400, 429)
  async check(
    @MaybeOwner() owner: Owner | undefined,
    @Body() dto: CreateSymptomCheckDto,
  ): Promise<SymptomCheckResult> {
    const symptoms = [...new Set(dto.symptoms)];
    const outcome = triage(symptoms);
    const info = owner
      ? await this.journey.resolve(owner)
      : {
          stage: 'unknown' as const,
          today: todayInZone('UTC'),
          birth: null,
        };
    let row: SymptomCheckRow | null = null;
    if (owner && (await this.consent.hasHealthDataConsent(owner))) {
      row = await this.prisma.symptomCheck.create({
        data: {
          ...ownerWhere(owner),
          date: fromIsoDate(info.today),
          symptoms,
          level: outcome.level,
          matchedRules: outcome.matchedRules,
          stage: info.stage,
          rulesVersion: TRIAGE_RULES.version,
        },
      });
    }
    return toResult(
      {
        id: row?.id ?? null,
        date: info.today,
        symptoms,
        level: outcome.level,
        matchedRules: outcome.matchedRules,
        stage: info.stage,
        rulesVersion: TRIAGE_RULES.version,
        createdAt: (row?.createdAt ?? new Date()).toISOString(),
      },
      row !== null,
    );
  }

  @Get()
  @ApiOwnerAuth()
  @ApiOperation({
    summary: 'My saved symptom checks',
    description:
      'Journal history in a date range (at most a year), newest first. Each result is rebuilt with the wording of the rules version that is live now; `rulesVersion` records the version used at the time.',
  })
  @ApiOkResponse({ type: [SymptomCheckResultDto] })
  @ApiErrors(400)
  async list(
    @CurrentOwner() owner: Owner,
    @Query() q: SymptomCheckRangeQuery,
  ): Promise<SymptomCheckResult[]> {
    if (q.to < q.from)
      throw new BadRequestException(['to must not be before from']);
    const span =
      (fromIsoDate(q.to).getTime() - fromIsoDate(q.from).getTime()) /
      86_400_000;
    if (span > MAX_RANGE_DAYS) {
      throw new BadRequestException(['range must be at most a year']);
    }
    const rows = await this.prisma.symptomCheck.findMany({
      where: {
        ...ownerWhere(owner),
        date: { gte: fromIsoDate(q.from), lte: fromIsoDate(q.to) },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) =>
      toResult(
        {
          id: r.id,
          date: toIsoDate(r.date),
          symptoms: r.symptoms as CheckSymptomCode[],
          level: r.level,
          matchedRules: r.matchedRules,
          stage: r.stage as TriageStage,
          rulesVersion: r.rulesVersion,
          createdAt: r.createdAt.toISOString(),
        },
        true,
      ),
    );
  }
}

interface StoredCheck {
  id: string | null;
  date: string;
  symptoms: CheckSymptomCode[];
  level: TriageLevel;
  matchedRules: string[];
  stage: TriageStage;
  rulesVersion: string;
  createdAt: string;
}

function toResult(c: StoredCheck, saved: boolean): SymptomCheckResult {
  const rules = TRIAGE_RULES;
  const action = rules.levels[c.level];
  return {
    ...c,
    saved,
    headline: action.headline,
    message: action.message,
    callToAction: action.callToAction,
    redFlags: triage(c.symptoms).redFlags,
    review: rules.review,
    sources: rules.sources.map((s) => ({ title: s.title, url: s.url })),
    disclaimer: rules.disclaimer,
  };
}
