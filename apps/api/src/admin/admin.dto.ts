import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import {
  ContentCategory,
  ContentKind,
  StaffRole,
  SUPPORTED_LOCALES,
} from '@preconception/contracts';
import { TagList } from '../common/tags.js';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageInfoDto, PageQueryDto } from '../common/pagination.js';

const CONTENT_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'archived',
] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ReferenceInputDto {
  @ApiProperty({ example: 'WHO recommendations on preconception care' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url?: string;
}

export class CreateArticleDto {
  @ApiProperty({ example: 'folic-acid-before-pregnancy' })
  @Matches(SLUG, {
    message: 'slug must be lowercase words separated by hyphens',
  })
  @MaxLength(120)
  slug: string;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) summary: string;

  @ApiProperty({ description: 'Markdown' })
  @IsString()
  @MaxLength(50_000)
  body: string;

  @ApiProperty({ type: [ReferenceInputDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReferenceInputDto)
  references: ReferenceInputDto[];

  @ApiProperty() @IsBoolean() premium: boolean;

  @ApiPropertyOptional({ enum: ContentCategory.options, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(ContentCategory.options)
  category?: ContentCategory | null;

  @ApiPropertyOptional({
    enum: [1, 2, 3],
    nullable: true,
    description: 'Set when the content is specific to one trimester',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(3)
  trimester?: number | null;

  @ApiPropertyOptional({ type: [String], maxItems: 20, example: ['iron'] })
  @TagList(20)
  tags?: string[];
}

/**
 * A recipe, activity or meal plan draft. `sections` is validated against RecipeSections,
 * ActivitySections or MealPlanSections in contracts (by endpoint).
 */
export class CreateStructuredContentDto {
  @ApiProperty({ example: 'lentil-and-spinach-dal' })
  @Matches(SLUG, {
    message: 'slug must be lowercase words separated by hyphens',
  })
  @MaxLength(120)
  slug: string;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) summary: string;

  @ApiProperty({ enum: ContentCategory.options })
  @IsIn(ContentCategory.options)
  category: ContentCategory;

  @ApiPropertyOptional({ enum: [1, 2, 3], nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(3)
  trimester?: number | null;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @TagList(20)
  tags?: string[];

  @ApiProperty({ type: [ReferenceInputDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReferenceInputDto)
  references: ReferenceInputDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Structured fields: RecipeSections, ActivitySections or MealPlanSections (see contracts)',
  })
  @IsObject()
  sections: Record<string, unknown>;
}

const LINE = 500;
const LIST = 12;

/** Structured week-guide fields (PRD §5). Mirrors WeekGuideSections in contracts. */
export class WeekGuideSectionsDto {
  @ApiProperty({
    description: 'Baby this week, 2-4 plain sentences; sizes as "about"',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  baby: string;

  @ApiProperty({
    description: 'Common changes in the body ("many women notice...")',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  body: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(LIST)
  @IsString({ each: true })
  @MaxLength(LINE, { each: true })
  symptoms: string[];

  @ApiProperty() @IsString() @MaxLength(1000) eat: string;
  @ApiProperty() @IsString() @MaxLength(1000) move: string;
  @ApiProperty({ description: 'Care that usually happens around now' })
  @IsString()
  @MaxLength(1000)
  visits: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(LIST)
  @IsString({ each: true })
  @MaxLength(LINE, { each: true })
  askAtVisit: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(LIST)
  @IsString({ each: true })
  @MaxLength(LINE, { each: true })
  prepare: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(LIST)
  @IsString({ each: true })
  @MaxLength(LINE, { each: true })
  avoid: string[];

  @ApiProperty({
    type: [String],
    description: 'Red flags most relevant this week; at least one',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIST)
  @IsString({ each: true })
  @MaxLength(LINE, { each: true })
  whenToGetHelp: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(LIST)
  @IsString({ each: true })
  @MaxLength(LINE, { each: true })
  checklist: string[];

  @ApiProperty() @IsString() @MaxLength(LINE) message: string;

  @ApiProperty({ nullable: true, type: String })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  firstPregnancyNote: string | null;

  @ApiProperty({ nullable: true, type: String })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  subsequentPregnancyNote: string | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'Short development milestones for the week',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIST)
  @IsString({ each: true })
  @MaxLength(LINE, { each: true })
  babyMilestones?: string[];

  @ApiPropertyOptional({
    type: () => SizeComparisonDto,
    nullable: true,
    description:
      'Only when the reviewing clinician supports a size comparison. Typical values, never a measurement of a specific baby.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => SizeComparisonDto)
  sizeComparison?: SizeComparisonDto | null;
}

export class SizeComparisonDto {
  @ApiProperty({ example: 'about the size of a lemon' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  @ApiProperty({ nullable: true, type: Number })
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0.1)
  @Max(60)
  lengthCm: number | null;

  @ApiProperty({ nullable: true, type: Number })
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0.1)
  @Max(6000)
  weightG: number | null;
}

export class CreateWeekGuideDto {
  @ApiProperty({
    minimum: 1,
    maximum: 42,
    description: 'Completed weeks of pregnancy this guide covers',
  })
  @IsInt()
  @Min(1)
  @Max(42)
  week: number;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale;

  @ApiProperty({ example: 'Week 12: the end of the first trimester' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) summary: string;

  @ApiProperty({ type: WeekGuideSectionsDto })
  @ValidateNested()
  @Type(() => WeekGuideSectionsDto)
  sections: WeekGuideSectionsDto;

  @ApiProperty({
    type: [ReferenceInputDto],
    description: 'At least one source',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReferenceInputDto)
  references: ReferenceInputDto[];
}

export class UpdateArticleDto extends PartialType(
  OmitType(CreateArticleDto, ['slug', 'locale'] as const),
) {
  @ApiPropertyOptional({
    type: WeekGuideSectionsDto,
    description: 'Week guides only',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeekGuideSectionsDto)
  sections?: WeekGuideSectionsDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Recipes, activities and meal plans only: replaces their structured fields (validated against the kind’s schema)',
  })
  @IsOptional()
  @IsObject()
  structuredSections?: Record<string, unknown>;
}

export class ArticleAdminQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: CONTENT_STATUSES })
  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: (typeof CONTENT_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(SLUG)
  slug?: string;

  @ApiPropertyOptional({ enum: ContentKind.options })
  @IsOptional()
  @IsIn(ContentKind.options)
  kind?: ContentKind;

  @ApiPropertyOptional({ enum: ContentCategory.options })
  @IsOptional()
  @IsIn(ContentCategory.options)
  category?: ContentCategory;

  @ApiPropertyOptional({
    description: 'Case-insensitive search in title and slug',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q?: string;
}

export class ReviewArticleDto {
  @ApiProperty({ enum: ['approved', 'changes_requested'] })
  @IsIn(['approved', 'changes_requested'])
  decision: 'approved' | 'changes_requested';

  @ApiProperty({
    example: 'MD, Obstetrics & Gynecology',
    description: 'Shown publicly with the article',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reviewerCredentials: string;

  @ApiProperty({
    type: [ReferenceInputDto],
    description: 'Sources checked during review',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReferenceInputDto)
  sources: ReferenceInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comments?: string;
}

export class AdminArticleDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ContentKind.options }) kind: string;
  @ApiProperty({ enum: ContentCategory.options, nullable: true, type: String })
  category: string | null;
  @ApiProperty({ nullable: true, type: Number }) trimester: number | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty({ nullable: true, type: Number }) week: number | null;
  @ApiProperty({ type: WeekGuideSectionsDto, nullable: true })
  sections: unknown;
  @ApiProperty() slug: string;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) locale: string;
  @ApiProperty() version: number;
  @ApiProperty() title: string;
  @ApiProperty() summary: string;
  @ApiProperty() body: string;
  @ApiProperty({ type: [ReferenceInputDto] }) references: unknown;
  @ApiProperty() premium: boolean;
  @ApiProperty({ enum: CONTENT_STATUSES }) status: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  publishedAt: Date | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  nextReviewDue: Date | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) createdById:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt: Date;
}

export class AdminArticlePageDto {
  @ApiProperty({ type: [AdminArticleDto] }) items: AdminArticleDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfoDto;
}

export class CreateTaskDto {
  @ApiProperty({ example: 'start-folic-acid' })
  @Matches(SLUG)
  @MaxLength(80)
  key: string;

  @ApiProperty({ enum: SUPPORTED_LOCALES })
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) description: string;
  @ApiProperty({ example: 'nutrition' })
  @Matches(/^[a-z][a-z_]{1,39}$/)
  category: string;
  @ApiProperty({ default: 0 }) @IsInt() @Min(0) sortOrder: number;
  @ApiProperty() @IsBoolean() premium: boolean;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 1,
    maximum: 42,
    description:
      'First pregnancy week the task is most relevant (null = any time)',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(42)
  fromWeek?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 42 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(42)
  toWeek?: number | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Linked article id',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9a-f-]{36}$/)
  articleId?: string | null;
}

export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['key', 'locale'] as const),
) {}

export class AdminTaskDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() key: string;
  @ApiProperty() locale: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() category: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty() premium: boolean;
  @ApiProperty({ enum: CONTENT_STATUSES }) status: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) articleId:
    string | null;
  @ApiProperty({ nullable: true, type: Number }) fromWeek: number | null;
  @ApiProperty({ nullable: true, type: Number }) toWeek: number | null;
}

export class UserLookupQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Exact email match' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Only staff accounts' })
  @IsOptional()
  @IsIn(['true', 'false'])
  staffOnly?: 'true' | 'false';
}

export class AdminUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true, type: String }) name: string | null;
  @ApiProperty({ enum: ['active', 'pending_deletion', 'deleted'] })
  status: string;
  @ApiProperty({ enum: StaffRole.options, nullable: true }) staffRole:
    string | null;
  @ApiProperty() twoFactorEnabled: boolean;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class AdminUserPageDto {
  @ApiProperty({ type: [AdminUserDto] }) items: AdminUserDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfoDto;
}

export class SetStaffRoleDto {
  @ApiProperty({
    enum: StaffRole.options,
    nullable: true,
    description: 'null removes staff access',
  })
  @ValidateIf((_, v) => v !== null)
  @IsIn(StaffRole.options)
  staffRole: StaffRole | null;
}

export class AuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'article.published' })
  @IsOptional()
  @Matches(/^[a-z_.]{1,64}$/)
  action?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Matches(/^[0-9a-f-]{36}$/)
  actorUserId?: string;
}

export class AuditEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() action: string;
  @ApiProperty({ nullable: true, type: String }) actorUserId: string | null;
  @ApiProperty({ nullable: true, type: String }) actorRole: string | null;
  @ApiProperty({ nullable: true, type: String }) targetType: string | null;
  @ApiProperty({ nullable: true, type: String }) targetId: string | null;
  @ApiProperty({ nullable: true, type: String }) requestId: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata: unknown;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class AuditPageDto {
  @ApiProperty({ type: [AuditEventDto] }) items: AuditEventDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfoDto;
}
