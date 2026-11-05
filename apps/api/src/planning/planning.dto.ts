import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type ActivityLog,
  type Appointment,
  AppointmentKind,
  ContentKind,
  DietPattern,
  FoodAllergy,
  type MealLog,
  MealSlot,
  NOTE_MAX_LENGTH,
  PlanAvailability,
  PlanTaskSource,
  type SavedItem,
  type ShoppingItem,
  SUPPORTED_LOCALES,
} from '@preconception/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../common/dates.js';
import { ActivityDto, RecipeDto } from '../content/catalog.dto.js';

type Locale = (typeof SUPPORTED_LOCALES)[number];
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// --- Queries ----------------------------------------------------------------

export class PlanQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description: "First day; defaults to today in the profile's time zone",
  })
  @IsOptional()
  @IsCalendarDate()
  date?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 7,
    default: 1,
    description: '1 = daily view, 7 = weekly view',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  days: number = 1;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale = 'en';
}

export class DateRangeQueryDto {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() from: string;
  @ApiProperty({
    format: 'date',
    description: 'Inclusive; at most 92 days after from',
  })
  @IsCalendarDate()
  to: string;
}

// --- Meal plan ----------------------------------------------------------------

class PlannedMealOutDto {
  @ApiProperty({ enum: MealSlot.options }) slot: MealSlot;
  @ApiProperty({ type: RecipeDto }) recipe: RecipeDto;
  @ApiProperty({ description: 'Logged as eaten on this date' }) eaten: boolean;
}

class PersonalMealDayDto {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ type: [PlannedMealOutDto] }) meals: PlannedMealOutDto[];
}

class MealFiltersDto {
  @ApiProperty({ enum: DietPattern.options, nullable: true, type: String })
  dietPattern: DietPattern | null;
  @ApiProperty({ enum: FoodAllergy.options, isArray: true })
  excludedAllergens: FoodAllergy[];
  @ApiProperty({
    type: [String],
    description:
      'Intolerances, excluded foods and clinician-advised restrictions',
  })
  excludedFoods: string[];
}

export class PersonalMealPlanDto {
  @ApiProperty({
    enum: PlanAvailability.options,
    description:
      'available; no_pregnancy; clinician_guidance (a clinician manages your eating, so no generic plan); none_published; none_matching (no plan fits your preferences)',
  })
  availability: PlanAvailability;
  @ApiProperty({ nullable: true, type: String }) planSlug: string | null;
  @ApiProperty({ nullable: true, type: String }) hydrationNote: string | null;
  @ApiProperty({ type: [PersonalMealDayDto] }) days: PersonalMealDayDto[];
  @ApiProperty({ type: MealFiltersDto }) filters: MealFiltersDto;
}

export class MealLogDto implements MealLog {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ enum: MealSlot.options }) slot: MealSlot;
  @ApiProperty() recipeSlug: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class MealLogParams {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() date: string;
  @ApiProperty({ enum: MealSlot.options })
  @IsIn(MealSlot.options)
  slot: MealSlot;
  @ApiProperty() @Matches(SLUG) @MaxLength(120) recipeSlug: string;
}

// --- Shopping list ------------------------------------------------------------

export class ShoppingItemDto implements ShoppingItem {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) quantity: string | null;
  @ApiProperty() checked: boolean;
  @ApiProperty({ nullable: true, type: String }) recipeSlug: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class CreateShoppingItemDto {
  @ApiProperty({ example: 'red lentils' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ nullable: true, example: '500 g' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  quantity?: string | null;
}

export class UpdateShoppingItemDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() checked?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  quantity?: string | null;
}

export class FromMealPlanDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'First day; defaults to today',
  })
  @IsOptional()
  @IsCalendarDate()
  date?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 7, default: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  days: number = 7;
}

export class ShoppingFromPlanResultDto {
  @ApiProperty({
    description: 'Items newly added; existing names are left as they are',
  })
  added: number;
  @ApiProperty({ type: [ShoppingItemDto] }) items: ShoppingItemDto[];
}

// --- Exercise -----------------------------------------------------------------

class PlannedActivityDto extends ActivityDto {
  @ApiProperty({ description: 'Logged as done on the requested date' })
  doneToday: boolean;
}

export class ExercisePlanDto {
  @ApiProperty({
    enum: PlanAvailability.options,
    description:
      'clinician_guidance when you said your clinician asked you to limit exercise',
  })
  availability: PlanAvailability;
  @ApiProperty({ nullable: true, type: Number }) week: number | null;
  @ApiProperty({ type: [PlannedActivityDto] }) activities: PlannedActivityDto[];
  @ApiProperty() disclaimer: string;
}

export class ActivityLogDto implements ActivityLog {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty() activitySlug: string;
  @ApiProperty({ nullable: true, type: Number }) minutes: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ActivityLogParams {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() date: string;
  @ApiProperty() @Matches(SLUG) @MaxLength(120) activitySlug: string;
}

export class PutActivityLogDto {
  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 600 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(600)
  minutes?: number | null;
}

// --- Saved content ------------------------------------------------------------

export class SavedItemDto implements SavedItem {
  @ApiProperty({ enum: ContentKind.options }) kind: ContentKind;
  @ApiProperty() slug: string;
  @ApiProperty({ format: 'date-time' }) savedAt: string;
}

export class SavedParams {
  @ApiProperty({ enum: ContentKind.options })
  @IsIn(ContentKind.options)
  kind: ContentKind;
  @ApiProperty() @Matches(SLUG) @MaxLength(120) slug: string;
}

export class SavedQueryDto {
  @ApiPropertyOptional({ enum: ContentKind.options })
  @IsOptional()
  @IsIn(ContentKind.options)
  kind?: ContentKind;
}

// --- Appointments -------------------------------------------------------------

export class AppointmentDto implements Appointment {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: AppointmentKind.options }) kind: AppointmentKind;
  @ApiProperty() title: string;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty({ nullable: true, type: String }) location: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Private; never logged',
  })
  notes: string | null;
  @ApiProperty({ type: [String] }) questions: string[];
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) pregnancyId:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class CreateAppointmentDto {
  @ApiProperty({ enum: AppointmentKind.options })
  @IsIn(AppointmentKind.options)
  kind: AppointmentKind;

  @ApiProperty({ example: 'Midwife check-up', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-12-01T10:30:00+00:00',
    description: 'With a UTC offset',
  })
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'startsAt must include a UTC offset',
  })
  startsAt: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: NOTE_MAX_LENGTH })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  notes?: string | null;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    description: 'Questions to ask',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  questions?: string[];
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional({ enum: AppointmentKind.options })
  @IsOptional()
  @IsIn(AppointmentKind.options)
  kind?: AppointmentKind;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'startsAt must include a UTC offset',
  })
  startsAt?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  location?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  notes?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  questions?: string[];
}

export class AppointmentQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Default: now (upcoming only)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

// --- Daily plan ---------------------------------------------------------------

export class PlanTaskDto {
  @ApiProperty({
    example: 'journal:2026-11-03',
    description: 'Stable for the same day',
  })
  key: string;
  @ApiProperty({
    enum: PlanTaskSource.options,
    description:
      'Where the state lives. Complete `plan` tasks with PUT /daily-plan/{date}/tasks/{key}; others through their own endpoints (journal → daily-logs, meal → meal-logs, activity → activity-logs, hydration → daily-logs.waterGlasses, checklist → readiness progress).',
  })
  source: PlanTaskSource;
  @ApiProperty() title: string;
  @ApiProperty({ description: 'True only when the matching record is saved' })
  done: boolean;
  @ApiProperty({
    description: 'False for informational tasks (appointments, reminders)',
  })
  completable: boolean;
  @ApiProperty({ nullable: true, type: String }) ref: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: '09:00',
    description: 'Local time, when relevant',
  })
  time: string | null;
}

export class DailyPlanDayDto {
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ nullable: true, type: Number }) pregnancyWeek: number | null;
  @ApiProperty({ type: [PlanTaskDto] }) tasks: PlanTaskDto[];
  @ApiProperty({ description: 'Completable tasks done' }) done: number;
  @ApiProperty({ description: 'Completable tasks' }) total: number;
}

export class DailyPlanDto {
  @ApiProperty({ type: [DailyPlanDayDto] }) days: DailyPlanDayDto[];
}

export class PlanTaskParams {
  @ApiProperty({ format: 'date' }) @IsCalendarDate() date: string;
  @ApiProperty({ example: 'guide:w12' })
  @Matches(/^guide:w([1-9]|[1-3][0-9]|4[0-2])$/)
  key: string;
}

export class PutPlanTaskDto {
  @ApiProperty() @IsBoolean() done: boolean;
}
