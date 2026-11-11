import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type BirthPreferences,
  DatingMethod,
  DatingSource,
  FetusCount,
  type GestationalAge,
  type PageInfo,
  type Pregnancy,
  PregnancyOutcome,
  SUPPORTED_LOCALES,
  TermStatus,
} from '@preconception/contracts';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../common/dates.js';
import { PageInfoDto } from '../common/pagination.js';
import { WeekGuideSectionsDto } from '../admin/admin.dto.js';

const when = (...methods: DatingMethod[]) =>
  ValidateIf((o: DatingDto) => methods.includes(o.method));

/** One dating method; only the fields for that method are read. */
export class DatingDto {
  @ApiProperty({ enum: DatingMethod.options })
  @IsIn(DatingMethod.options)
  method: DatingMethod;

  @ApiPropertyOptional({
    format: 'date',
    description: 'lmp: first day of the last period',
  })
  @when('lmp')
  @IsCalendarDate()
  lmpDate?: string;

  @ApiPropertyOptional({
    minimum: 20,
    maximum: 45,
    description: 'lmp: usual cycle length in days (default 28)',
  })
  @when('lmp')
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(45)
  cycleLengthDays?: number;

  @ApiPropertyOptional({
    format: 'date',
    description: 'due_date: a known due date',
  })
  @when('due_date')
  @IsCalendarDate()
  dueDate?: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'ultrasound: date of the scan',
  })
  @when('ultrasound')
  @IsCalendarDate()
  scanDate?: string;

  @ApiPropertyOptional({
    minimum: 4,
    maximum: 40,
    description: 'ultrasound: weeks at the scan',
  })
  @when('ultrasound')
  @IsInt()
  @Min(4)
  @Max(40)
  gestationalWeeks?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 6,
    description: 'ultrasound: extra days at the scan',
  })
  @when('ultrasound')
  @IsInt()
  @Min(0)
  @Max(6)
  gestationalDays?: number;

  @ApiPropertyOptional({
    format: 'date',
    description: 'ivf: embryo transfer date',
  })
  @when('ivf')
  @IsCalendarDate()
  transferDate?: string;

  @ApiPropertyOptional({
    minimum: 2,
    maximum: 7,
    description: 'ivf: embryo age at transfer (usually 3 or 5)',
  })
  @when('ivf')
  @IsInt()
  @Min(2)
  @Max(7)
  embryoAgeDays?: number;
}

export class PregnancyDetailsDto {
  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  firstPregnancy?: boolean | null;

  @ApiPropertyOptional({ enum: FetusCount.options })
  @IsOptional()
  @IsIn(FetusCount.options)
  fetusCount?: FetusCount;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  confirmedByClinician?: boolean | null;

  @ApiPropertyOptional({
    description:
      'Clinician advised avoiding exercise: hides movement suggestions',
  })
  @IsOptional()
  @IsBoolean()
  restrictExercise?: boolean;

  @ApiPropertyOptional({
    description:
      'A clinician or dietitian manages what I eat (for example because of a condition). Generic meal plans are then withheld. Self-reported; never inferred.',
  })
  @IsOptional()
  @IsBoolean()
  clinicianNutritionPlan?: boolean;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    example: ['dairy'],
    description: 'Foods a clinician advised avoiding',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
      : value,
  )
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/^[a-zA-Z][a-zA-Z _-]{0,39}$/, {
    each: true,
    message: 'foodRestrictions entries must be short words',
  })
  foodRestrictions?: string[];
}

export class CreatePregnancyDto extends PregnancyDetailsDto {
  @ApiProperty({ type: DatingDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DatingDto)
  dating: DatingDto;

  @ApiPropertyOptional({
    enum: DatingSource.options,
    default: 'self',
    description:
      '"clinician" when the date came from a doctor, midwife or scan report',
  })
  @IsOptional()
  @IsIn(DatingSource.options)
  source?: DatingSource;
}

export class RedateDto {
  @ApiProperty({ type: DatingDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DatingDto)
  dating: DatingDto;

  @ApiPropertyOptional({ enum: DatingSource.options, default: 'self' })
  @IsOptional()
  @IsIn(DatingSource.options)
  source?: DatingSource;
}

export class EndPregnancyDto {
  @ApiProperty({
    enum: PregnancyOutcome.options,
    description:
      'birth switches toward postpartum; loss stops all pregnancy content',
  })
  @IsIn(PregnancyOutcome.options)
  outcome: PregnancyOutcome;

  @ApiProperty({ format: 'date' })
  @IsCalendarDate()
  endedOn: string;
}

export class WeekQueryDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: (typeof SUPPORTED_LOCALES)[number] = 'en';
}

export class GestationalAgeDto implements GestationalAge {
  @ApiProperty({ example: 12 }) weeks: number;
  @ApiProperty({ example: 3, minimum: 0, maximum: 6 }) days: number;
}

export class PregnancyDto implements Pregnancy {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['active', 'ended'] }) status: 'active' | 'ended';
  @ApiProperty({
    format: 'date',
    description: 'Estimated; a clinician may revise it',
  })
  dueDate: string;
  @ApiProperty({ enum: DatingMethod.options }) datingMethod: DatingMethod;
  @ApiProperty({ enum: DatingSource.options }) datingSource: DatingSource;
  @ApiProperty({
    format: 'date',
    description:
      "The caller's today (profile time zone); the end date once ended",
  })
  today: string;
  @ApiProperty({ type: GestationalAgeDto }) gestationalAge: GestationalAge;
  @ApiProperty({
    minimum: 1,
    maximum: 42,
    description: 'Week-guide week: completed weeks',
  })
  week: number;
  @ApiProperty({ enum: [1, 2, 3] }) trimester: 1 | 2 | 3;
  @ApiProperty({ enum: TermStatus.options }) termStatus: TermStatus;
  @ApiProperty({ description: 'Negative once past the due date' })
  daysUntilDue: number;
  @ApiProperty({ nullable: true, type: Boolean }) firstPregnancy:
    boolean | null;
  @ApiProperty({ enum: FetusCount.options }) fetusCount: FetusCount;
  @ApiProperty({ nullable: true, type: Boolean }) confirmedByClinician:
    boolean | null;
  @ApiProperty() restrictExercise: boolean;
  @ApiProperty({ type: [String] }) foodRestrictions: string[];
  @ApiProperty() clinicianNutritionPlan: boolean;
  @ApiProperty({ enum: PregnancyOutcome.options, nullable: true })
  outcome: PregnancyOutcome | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) endedOn:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class PregnancyPageDto {
  @ApiProperty({ type: [PregnancyDto] }) items: PregnancyDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfo;
}

export class DatingChangeDto {
  @ApiProperty({ format: 'date' }) previousDueDate: string;
  @ApiProperty({ format: 'date' }) newDueDate: string;
  @ApiProperty({ description: 'Positive = later' }) shiftDays: number;
}

export class RedateResultDto {
  @ApiProperty({ type: PregnancyDto }) pregnancy: PregnancyDto;
  @ApiProperty({ type: DatingChangeDto }) change: DatingChangeDto;
}

export class DatingRecordDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: DatingMethod.options }) method: DatingMethod;
  @ApiProperty({ enum: DatingSource.options }) source: DatingSource;
  @ApiProperty({ type: DatingDto }) inputs: DatingDto;
  @ApiProperty({ format: 'date' }) dueDate: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class TimelineWeekDto {
  @ApiProperty() week: number;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty({ enum: [1, 2, 3] }) trimester: number;
}

export class MilestoneDto {
  @ApiProperty({
    enum: [
      'second_trimester',
      'third_trimester',
      'early_term',
      'full_term',
      'due_date',
      'late_term',
      'postterm',
    ],
  })
  key: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ type: GestationalAgeDto }) gestationalAge: GestationalAge;
  @ApiProperty({ enum: ['past', 'today', 'upcoming'] }) status: string;
}

export class TimelineDto {
  @ApiProperty({ format: 'date' }) dueDate: string;
  @ApiProperty({ format: 'date' }) today: string;
  @ApiProperty({ type: [TimelineWeekDto] }) weeks: TimelineWeekDto[];
  @ApiProperty({ type: [MilestoneDto] }) milestones: MilestoneDto[];
}

class ReviewInfoDto {
  @ApiProperty() reviewerCredentials: string;
  @ApiProperty({ format: 'date-time' }) reviewedAt: string;
}

class ReferenceOutDto {
  @ApiProperty() title: string;
  @ApiPropertyOptional({ format: 'uri' }) url?: string;
}

export class WeekGuideDto {
  @ApiProperty({ minimum: 1, maximum: 42 }) week: number;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) locale: string;
  @ApiProperty() version: number;
  @ApiProperty() title: string;
  @ApiProperty() summary: string;
  @ApiProperty({ type: WeekGuideSectionsDto }) sections: WeekGuideSectionsDto;
  @ApiProperty({ type: [ReferenceOutDto] }) references: ReferenceOutDto[];
  @ApiProperty({ type: ReviewInfoDto, nullable: true })
  review: ReviewInfoDto | null;
  @ApiProperty({ format: 'date-time' }) publishedAt: string;
  @ApiProperty({ format: 'date', nullable: true, type: String }) nextReviewDue:
    string | null;
}

export class ThisWeekDto {
  @ApiProperty({ type: PregnancyDto }) pregnancy: PregnancyDto;
  @ApiProperty({
    type: WeekGuideDto,
    nullable: true,
    description: 'Null until this week is reviewed and published',
  })
  guide: WeekGuideDto | null;
}

export class GuideWeekParam {
  @ApiProperty({ minimum: 1, maximum: 42 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(42)
  week: number;
}

export class WeekGuideRangeQueryDto extends WeekQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 42, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(42)
  from: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 42, default: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(42)
  to: number = 42;
}

export class PregnancyWeekDetailDto {
  @ApiProperty({ minimum: 1, maximum: 42 }) week: number;
  @ApiProperty({ enum: [1, 2, 3] }) trimester: 1 | 2 | 3;
  @ApiProperty({
    format: 'date',
    description: 'First day of the week for this pregnancy',
  })
  startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty({ enum: ['past', 'current', 'upcoming'] })
  status: 'past' | 'current' | 'upcoming';
  @ApiProperty({ type: WeekGuideDto, nullable: true })
  guide: WeekGuideDto | null;
}

const BIRTH_SETTINGS = [
  'hospital',
  'birth_centre',
  'home',
  'undecided',
] as const;
const FEEDING = [
  'breastfeeding',
  'formula',
  'combination',
  'undecided',
] as const;

export class PutBirthPreferencesDto {
  @ApiProperty({ enum: BIRTH_SETTINGS, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsIn(BIRTH_SETTINGS)
  birthSetting: (typeof BIRTH_SETTINGS)[number] | null;

  @ApiProperty({
    type: [String],
    maxItems: 10,
    example: ['breathing techniques'],
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  painRelief: string[];

  @ApiProperty({ type: [String], maxItems: 10, example: ['partner'] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  supportPeople: string[];

  @ApiProperty({ enum: FEEDING, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsIn(FEEDING)
  feedingIntention: (typeof FEEDING)[number] | null;

  @ApiProperty({
    nullable: true,
    type: String,
    maxLength: 2000,
    description: 'Private; never logged',
  })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  notes: string | null;
}

export class BirthPreferencesDto
  extends PutBirthPreferencesDto
  implements BirthPreferences
{
  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Null until first saved',
  })
  updatedAt: string | null;
}
