import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type Article,
  type ArticleSummary,
  ContentCategory,
  type PageInfo,
  SUPPORTED_LOCALES,
  type Trimester,
} from '@preconception/contracts';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PageInfoDto, PageQueryDto } from '../common/pagination.js';

type Locale = (typeof SUPPORTED_LOCALES)[number];

export class LocaleQueryDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale = 'en';
}

export class ArticleListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale = 'en';

  @ApiPropertyOptional({ enum: ContentCategory.options })
  @IsOptional()
  @IsIn(ContentCategory.options)
  category?: ContentCategory;

  @ApiPropertyOptional({
    enum: [1, 2, 3],
    description:
      'Content for this trimester plus content that applies throughout',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  trimester?: Trimester;

  @ApiPropertyOptional({ example: 'iron', description: 'Lower-case tag' })
  @IsOptional()
  @Matches(/^[a-z0-9_-]{1,40}$/)
  tag?: string;
}

export class ReferenceDto {
  @ApiProperty() title: string;
  @ApiPropertyOptional({ format: 'uri' }) url?: string;
}

export class ArticleReviewDto {
  @ApiProperty({ example: 'MD, Obstetrics & Gynecology' })
  reviewerCredentials: string;
  @ApiProperty({ format: 'date-time' }) reviewedAt: string;
}

export class ArticleSummaryDto implements ArticleSummary {
  @ApiProperty({ example: 'folic-acid-before-pregnancy' }) slug: string;
  @ApiProperty({ enum: SUPPORTED_LOCALES }) locale: Locale;
  @ApiProperty() version: number;
  @ApiProperty() title: string;
  @ApiProperty() summary: string;
  @ApiProperty() premium: boolean;
  @ApiProperty({ format: 'date-time' }) publishedAt: string;
  @ApiProperty({ enum: ContentCategory.options, nullable: true, type: String })
  category: ContentCategory | null;
  @ApiProperty({ enum: [1, 2, 3], nullable: true, type: Number })
  trimester: Trimester | null;
  @ApiProperty({ type: [String] }) tags: string[];
}

export class ArticleDto extends ArticleSummaryDto implements Article {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Null when premium and locked',
  })
  body: string | null;

  @ApiProperty() locked: boolean;
  @ApiProperty({ type: [ReferenceDto] }) references: ReferenceDto[];
  @ApiProperty({ type: ArticleReviewDto, nullable: true })
  review: ArticleReviewDto | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) nextReviewDue:
    string | null;
}

export class ArticlePageDto {
  @ApiProperty({ type: [ArticleSummaryDto] }) items: ArticleSummaryDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfo;
}
