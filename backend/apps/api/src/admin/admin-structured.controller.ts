import { ThrottleWrite } from '../common/throttle.js';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ContentCategory,
  type ContentCoverage,
  ContentKind,
  SUPPORTED_LOCALES,
} from '@preconception/contracts';
import { IsIn, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, Staff } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/owner.js';
import { ApiErrors, ApiUserAuth } from '../common/swagger.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  AdminContentService,
  type StructuredKind,
} from './admin-content.service.js';
import { AdminArticleDto, CreateStructuredContentDto } from './admin.dto.js';

type Locale = (typeof SUPPORTED_LOCALES)[number];

class CoverageQueryDto {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale = 'en';
}

class WeekCoverageDto {
  @ApiProperty() week: number;
  @ApiProperty() published: boolean;
  @ApiProperty({
    enum: ['draft', 'in_review', 'approved'],
    nullable: true,
    type: String,
  })
  workingStatus: 'draft' | 'in_review' | 'approved' | null;
}

class KindCoverageDto {
  @ApiProperty({ enum: ContentKind.options }) kind: ContentKind;
  @ApiProperty({ enum: ContentCategory.options, nullable: true, type: String })
  category: ContentCategory | null;
  @ApiProperty() draft: number;
  @ApiProperty() inReview: number;
  @ApiProperty() approved: number;
  @ApiProperty() published: number;
}

class ContentCoverageDto implements ContentCoverage {
  @ApiProperty({ type: [WeekCoverageDto] }) weekGuides: WeekCoverageDto[];
  @ApiProperty({ type: [KindCoverageDto] }) byKind: KindCoverageDto[];
}

/**
 * Recipes, activities and meal plans are content versions with structured `sections`. They
 * are created here and then edited, reviewed, published and archived with the same
 * /admin/articles/{id} endpoints, so they get the same clinical review workflow and audit.
 */
@ApiTags('admin')
@ApiUserAuth()
@ApiErrors(403)
@Controller('admin')
export class AdminStructuredController {
  constructor(
    private readonly content: AdminContentService,
    private readonly prisma: PrismaService,
  ) {}

  @ThrottleWrite('staffWrite')
  @Post('recipes')
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create a recipe draft',
    description:
      'Roles: content_editor, administrator. `sections` must match RecipeSections. Review and publish with /admin/articles/{id}/….',
  })
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiErrors(400, 409)
  recipe(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateStructuredContentDto,
    @Req() req: Request,
  ) {
    return this.create('recipe', actor, dto, req);
  }

  @ThrottleWrite('staffWrite')
  @Post('activities')
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create an exercise or movement activity draft',
    description:
      'Roles: content_editor, administrator. `sections` must match ActivitySections: stop signs are required; duration and intensity may be null.',
  })
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiErrors(400, 409)
  activity(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateStructuredContentDto,
    @Req() req: Request,
  ) {
    return this.create('activity', actor, dto, req);
  }

  @ThrottleWrite('staffWrite')
  @Post('meal-plans')
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create a meal plan draft',
    description:
      'Roles: content_editor, administrator. `sections` must match MealPlanSections. Publishing fails (409) until every referenced recipe is published.',
  })
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiErrors(400, 409)
  mealPlan(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateStructuredContentDto,
    @Req() req: Request,
  ) {
    return this.create('meal_plan', actor, dto, req);
  }

  @ThrottleWrite('staffWrite')
  @Post('visit-schedules')
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create a prenatal visit schedule draft (one per trimester)',
    description:
      'Roles: content_editor, administrator. `sections` must match VisitScheduleSections (visits with week windows, purpose and typical checks, written by the clinical team). Use category prenatal_care. Review and publish with /admin/articles/{id}/….',
  })
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiErrors(400, 409)
  visitSchedule(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateStructuredContentDto,
    @Req() req: Request,
  ) {
    return this.create('visit_schedule', actor, dto, req);
  }

  @ThrottleWrite('staffWrite')
  @Post('postpartum-guides')
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create a postpartum week guide draft (weeks 1-6 after birth)',
    description:
      'Roles: content_editor, administrator. `sections` must match PostpartumGuideSections; the slug must be "postpartum-week-<sections.week>". Use category postpartum. Review and publish with /admin/articles/{id}/….',
  })
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiErrors(400, 409)
  postpartumGuide(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateStructuredContentDto,
    @Req() req: Request,
  ) {
    return this.create('postpartum_guide', actor, dto, req);
  }

  @Get('content/coverage')
  @Staff('content_editor', 'clinical_reviewer')
  @ApiOperation({
    summary: 'What is published, in progress or missing',
    description:
      'Week guides 1-42 with their state, and version counts by kind and category. Use it to plan authoring and review.',
  })
  @ApiOkResponse({ type: ContentCoverageDto })
  async coverage(@Query() q: CoverageQueryDto): Promise<ContentCoverage> {
    const [guides, groups] = await Promise.all([
      this.prisma.article.findMany({
        where: {
          kind: 'week_guide',
          locale: q.locale,
          status: { not: 'archived' },
        },
        select: { week: true, status: true },
      }),
      this.prisma.article.groupBy({
        by: ['kind', 'category', 'status'],
        where: { locale: q.locale, status: { not: 'archived' } },
        _count: { _all: true },
      }),
    ]);
    const weekGuides = Array.from({ length: 42 }, (_, i) => {
      const rows = guides.filter((g) => g.week === i + 1);
      const working = rows.find((r) => r.status !== 'published');
      return {
        week: i + 1,
        published: rows.some((r) => r.status === 'published'),
        workingStatus:
          (working?.status as 'draft' | 'in_review' | 'approved' | undefined) ??
          null,
      };
    });
    const byKey = new Map<string, ContentCoverage['byKind'][number]>();
    for (const g of groups) {
      const key = `${g.kind}:${g.category ?? ''}`;
      const entry = byKey.get(key) ?? {
        kind: g.kind,
        category: (g.category as ContentCategory | null) ?? null,
        draft: 0,
        inReview: 0,
        approved: 0,
        published: 0,
      };
      const n = g._count._all;
      if (g.status === 'draft') entry.draft += n;
      if (g.status === 'in_review') entry.inReview += n;
      if (g.status === 'approved') entry.approved += n;
      if (g.status === 'published') entry.published += n;
      byKey.set(key, entry);
    }
    return { weekGuides, byKind: [...byKey.values()] };
  }

  private create(
    kind: StructuredKind,
    actor: SessionUser,
    dto: CreateStructuredContentDto,
    req: Request,
  ) {
    return this.content.createDraft(
      actor,
      {
        kind,
        slug: dto.slug,
        locale: dto.locale,
        title: dto.title,
        summary: dto.summary,
        body: '',
        references: dto.references,
        premium: false,
        sections: dto.sections,
        category: dto.category,
        trimester: dto.trimester ?? null,
        tags: dto.tags ?? [],
      },
      req.requestId,
    );
  }
}
