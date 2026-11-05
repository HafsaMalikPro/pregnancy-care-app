import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ActivityLevel,
  DietPattern,
  FoodAllergy,
  type Profile,
  SUPPORTED_LOCALES,
} from '@preconception/contracts';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
  registerDecorator,
} from 'class-validator';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { TagList } from '../common/tags.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Profile as ProfileRow } from '../generated/prisma/client.js';
import { ReminderScheduleService } from '../reminders/reminder-schedule.service.js';

type Locale = (typeof SUPPORTED_LOCALES)[number];

function isTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function IsTimeZone() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isTimeZone',
      target: target.constructor,
      propertyName,
      options: { message: `${propertyName} must be an IANA time zone` },
      validator: { validate: isTimeZone },
    });
}

class ProfileDto implements Profile {
  @ApiProperty({ example: 'Europe/London', description: 'IANA time zone' })
  @IsTimeZone()
  timeZone: string;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale;

  @ApiProperty({
    nullable: true,
    type: Number,
    minimum: 0,
    maximum: 60,
    description:
      'Months until the person hopes to start trying, if they chose to share it',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  planningHorizonMonths: number | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'PK',
    description:
      'ISO 3166-1 alpha-2; selects emergency numbers, visit templates and foods',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode must be two capital letters' })
  countryCode: string | null;

  @ApiProperty({ enum: DietPattern.options, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(DietPattern.options)
  dietPattern: DietPattern | null;

  @ApiProperty({ enum: FoodAllergy.options, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(FoodAllergy.options, { each: true })
  foodAllergies: FoodAllergy[];

  @ApiProperty({ enum: ActivityLevel.options, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(ActivityLevel.options)
  activityLevel: ActivityLevel | null;

  // Optional for older clients: when omitted, the saved value is kept.

  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    example: ['lactose'],
    description:
      'Foods that disagree with you (not allergies). Meal plans leave them out.',
  })
  @TagList(20)
  foodIntolerances: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 30,
    example: ['beef'],
    description: 'Foods you choose not to eat. Meal plans leave them out.',
  })
  @TagList(30)
  excludedFoods: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    example: ['south_asian'],
    description:
      'Preferred cuisines. Ranks meal plans; never overrides safety filters.',
  })
  @TagList(10)
  cuisinePreferences: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    example: ['nutrition', 'mental_wellbeing'],
    description: 'Content categories you want to see more of (ContentCategory)',
  })
  @TagList(20)
  contentTopics: string[];

  @ApiPropertyOptional({ description: 'Prefer reduced motion in the app' })
  @IsOptional()
  @IsBoolean()
  reducedMotion: boolean;

  @ApiPropertyOptional({ description: 'Prefer larger text in the app' })
  @IsOptional()
  @IsBoolean()
  largerText: boolean;
}

const DEFAULT_PROFILE: Profile = {
  timeZone: 'UTC',
  locale: 'en',
  planningHorizonMonths: null,
  countryCode: null,
  dietPattern: null,
  foodAllergies: [],
  activityLevel: null,
  foodIntolerances: [],
  excludedFoods: [],
  cuisinePreferences: [],
  contentTopics: [],
  reducedMotion: false,
  largerText: false,
};

@ApiTags('profile')
@ApiOwnerAuth()
@Controller('me/profile')
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: ReminderScheduleService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get profile',
    description: 'Defaults when never saved.',
  })
  @ApiOkResponse({ type: ProfileDto })
  async get(@CurrentOwner() owner: Owner): Promise<Profile> {
    const row = await this.prisma.profile.findFirst({
      where: ownerWhere(owner),
    });
    return row ? toProfile(row) : DEFAULT_PROFILE;
  }

  @Put()
  @ApiOperation({
    summary: 'Create or replace profile',
    description:
      'Replaces the core fields. The preference fields (intolerances, excluded foods, cuisines, content topics, accessibility) keep their saved value when omitted.',
  })
  @ApiOkResponse({ type: ProfileDto })
  @ApiErrors(400)
  async put(
    @CurrentOwner() owner: Owner,
    @Body() dto: ProfileDto,
  ): Promise<Profile> {
    const data = {
      timeZone: dto.timeZone,
      locale: dto.locale,
      planningHorizonMonths: dto.planningHorizonMonths ?? null,
      countryCode: dto.countryCode ?? null,
      dietPattern: dto.dietPattern ?? null,
      foodAllergies: dto.foodAllergies ?? [],
      activityLevel: dto.activityLevel ?? null,
      ...(dto.foodIntolerances !== undefined && {
        foodIntolerances: dto.foodIntolerances,
      }),
      ...(dto.excludedFoods !== undefined && {
        excludedFoods: dto.excludedFoods,
      }),
      ...(dto.cuisinePreferences !== undefined && {
        cuisinePreferences: dto.cuisinePreferences,
      }),
      ...(dto.contentTopics !== undefined && {
        contentTopics: dto.contentTopics,
      }),
      ...(dto.reducedMotion !== undefined && {
        reducedMotion: dto.reducedMotion,
      }),
      ...(dto.largerText !== undefined && { largerText: dto.largerText }),
    };
    if (owner.kind === 'user') {
      const row = await this.prisma.$transaction(async (tx) => {
        const before = await tx.profile.findUnique({
          where: { userId: owner.id },
          select: { timeZone: true },
        });
        const saved = await tx.profile.upsert({
          where: { userId: owner.id },
          create: { userId: owner.id, ...data },
          update: data,
        });
        // Email reminders fire at local time, so a new zone moves their next send.
        if ((before?.timeZone ?? 'UTC') !== saved.timeZone) {
          await this.reminders.rescheduleUser(owner.id, tx);
        }
        return saved;
      });
      return toProfile(row);
    }
    const row = await this.prisma.profile.upsert({
      where: { anonymousSessionId: owner.id },
      create: { anonymousSessionId: owner.id, ...data },
      update: data,
    });
    return toProfile(row);
  }
}

function toProfile(row: ProfileRow): Profile {
  return {
    timeZone: row.timeZone,
    locale: row.locale as Locale,
    planningHorizonMonths: row.planningHorizonMonths,
    countryCode: row.countryCode,
    dietPattern: row.dietPattern as DietPattern | null,
    foodAllergies: row.foodAllergies,
    activityLevel: row.activityLevel as ActivityLevel | null,
    foodIntolerances: row.foodIntolerances,
    excludedFoods: row.excludedFoods,
    cuisinePreferences: row.cuisinePreferences,
    contentTopics: row.contentTopics,
    reducedMotion: row.reducedMotion,
    largerText: row.largerText,
  };
}
