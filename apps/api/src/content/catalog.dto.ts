import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ActivityType,
  ContentCategory,
  DietPattern,
  FoodAllergy,
  MealSlot,
  type PageInfo,
  SUPPORTED_LOCALES,
  type Trimester,
} from '@preconception/contracts';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PageInfoDto, PageQueryDto } from '../common/pagination.js';
import { ArticleReviewDto, ReferenceDto } from './content.dto.js';

type Locale = (typeof SUPPORTED_LOCALES)[number];
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : value;

class LocalePageQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale = 'en';

  @ApiPropertyOptional({ enum: [1, 2, 3] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  trimester?: Trimester;

  @ApiPropertyOptional({ example: 'iron' })
  @IsOptional()
  @Matches(/^[a-z0-9_-]{1,40}$/)
  tag?: string;
}

export class RecipeQueryDto extends LocalePageQuery {
  @ApiPropertyOptional({ enum: MealSlot.options })
  @IsOptional()
  @IsIn(MealSlot.options)
  slot?: MealSlot;

  @ApiPropertyOptional({
    enum: DietPattern.options,
    description: 'Only recipes marked as suiting this pattern',
  })
  @IsOptional()
  @IsIn(DietPattern.options)
  diet?: DietPattern;

  @ApiPropertyOptional({
    description:
      'Comma-separated FoodAllergy codes; recipes containing any are left out',
    example: 'milk,egg',
  })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(FoodAllergy.options, { each: true })
  excludeAllergens?: FoodAllergy[];
}

export class ActivityQueryDto extends LocalePageQuery {
  @ApiPropertyOptional({ enum: ActivityType.options })
  @IsOptional()
  @IsIn(ActivityType.options)
  type?: ActivityType;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 42,
    description: 'Only activities reviewed for this week',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(42)
  week?: number;
}

export class MealPlanQueryDto extends LocalePageQuery {
  @ApiPropertyOptional({ enum: DietPattern.options })
  @IsOptional()
  @IsIn(DietPattern.options)
  diet?: DietPattern;
}

export class SlugLocaleQueryDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale = 'en';
}

// --- Responses ----------------------------------------------------------------

export class MediaDto {
  @ApiProperty({ format: 'uri' }) url: string;
  @ApiProperty() alt: string;
  @ApiProperty({ enum: ['image', 'video'] }) kind: 'image' | 'video';
}

class IngredientDto {
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) quantity: string | null;
  @ApiProperty({ enum: FoodAllergy.options, isArray: true })
  allergens: FoodAllergy[];
}

class NoteDto {
  @ApiProperty() name: string;
  @ApiProperty() note: string;
}

class SubstitutionDto {
  @ApiProperty() ingredient: string;
  @ApiProperty({ type: [String] }) alternatives: string[];
}

export class RecipeSectionsDto {
  @ApiProperty({ enum: MealSlot.options, isArray: true }) mealSlots: MealSlot[];
  @ApiProperty() servings: number;
  @ApiProperty({ nullable: true, type: Number }) prepMinutes: number | null;
  @ApiProperty({ type: [IngredientDto] }) ingredients: IngredientDto[];
  @ApiProperty({ type: [String] }) steps: string[];
  @ApiProperty({ enum: DietPattern.options, isArray: true })
  dietPatterns: DietPattern[];
  @ApiProperty({
    type: [NoteDto],
    description: 'Reviewed nutrient notes. No targets.',
  })
  nutrients: NoteDto[];
  @ApiProperty({ type: [String] }) foodSafetyNotes: string[];
  @ApiProperty({ type: [SubstitutionDto] }) substitutions: SubstitutionDto[];
  @ApiProperty({ nullable: true, type: String }) cuisine: string | null;
  @ApiProperty({ type: [MediaDto] }) media: MediaDto[];
}

class ContentBaseDto {
  @ApiProperty() slug: string;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) locale: Locale;
  @ApiProperty() version: number;
  @ApiProperty() title: string;
  @ApiProperty() summary: string;
  @ApiProperty({ enum: ContentCategory.options, nullable: true, type: String })
  category: ContentCategory | null;
  @ApiProperty({ enum: [1, 2, 3], nullable: true, type: Number })
  trimester: Trimester | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty({ type: [ReferenceDto] }) references: ReferenceDto[];
  @ApiProperty({
    type: ArticleReviewDto,
    nullable: true,
    description:
      'The approving clinical review. Null means not shown as reviewed.',
  })
  review: ArticleReviewDto | null;
  @ApiProperty({ format: 'date-time' }) publishedAt: string;
  @ApiProperty({ format: 'date', nullable: true, type: String }) nextReviewDue:
    string | null;
}

export class RecipeDto extends ContentBaseDto {
  @ApiProperty({ type: RecipeSectionsDto }) sections: RecipeSectionsDto;
  @ApiProperty({
    enum: FoodAllergy.options,
    isArray: true,
    description: 'Every allergen in any ingredient',
  })
  allergens: FoodAllergy[];
}

export class ActivitySectionsDto {
  @ApiProperty({ enum: ActivityType.options }) type: ActivityType;
  @ApiProperty({ type: [String] }) instructions: string[];
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Only as approved by the reviewer',
  })
  durationMinutes: number | null;
  @ApiProperty({
    enum: ['gentle', 'light', 'moderate'],
    nullable: true,
    type: String,
  })
  intensity: 'gentle' | 'light' | 'moderate' | null;
  @ApiProperty({ enum: [1, 2, 3], isArray: true }) trimesters: Trimester[];
  @ApiProperty({ nullable: true, type: Number }) fromWeek: number | null;
  @ApiProperty({ nullable: true, type: Number }) toWeek: number | null;
  @ApiProperty({ type: [String] }) safetyNotes: string[];
  @ApiProperty({ type: [String] }) contraindications: string[];
  @ApiProperty({
    type: [String],
    description: 'Stop and seek care if any of these happen',
  })
  stopSigns: string[];
  @ApiProperty({ type: [MediaDto] }) media: MediaDto[];
}

export class ActivityDto extends ContentBaseDto {
  @ApiProperty({ type: ActivitySectionsDto }) sections: ActivitySectionsDto;
}

class PlannedMealDto {
  @ApiProperty({ enum: MealSlot.options }) slot: MealSlot;
  @ApiProperty() recipeSlug: string;
}

class MealPlanDayDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: '1 = Monday' })
  day: number;
  @ApiProperty({ type: [PlannedMealDto] }) meals: PlannedMealDto[];
}

export class MealPlanSectionsDto {
  @ApiProperty({ type: [MealPlanDayDto] }) days: MealPlanDayDto[];
  @ApiProperty({ enum: DietPattern.options, isArray: true })
  dietPatterns: DietPattern[];
  @ApiProperty({ enum: [1, 2, 3], isArray: true }) trimesters: Trimester[];
  @ApiProperty({ description: 'Reviewed hydration guidance' })
  hydrationNote: string;
  @ApiProperty({ nullable: true, type: String }) cuisine: string | null;
}

export class MealPlanDto extends ContentBaseDto {
  @ApiProperty({ type: MealPlanSectionsDto }) sections: MealPlanSectionsDto;
  @ApiProperty({
    type: [RecipeDto],
    description: 'Published recipes the plan refers to',
  })
  recipes: RecipeDto[];
}

export class RecipePageDto {
  @ApiProperty({ type: [RecipeDto] }) items: RecipeDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfo;
}
export class ActivityPageDto {
  @ApiProperty({ type: [ActivityDto] }) items: ActivityDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfo;
}
export class MealPlanPageDto {
  @ApiProperty({ type: [MealPlanDto] }) items: MealPlanDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfo;
}
