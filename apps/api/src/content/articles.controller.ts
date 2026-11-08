import { ParseSlugPipe } from '../common/pipes.js';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Article } from '@preconception/contracts';
import { MaybeOwner, OptionalAuth } from '../auth/auth.decorators.js';
import type { Owner } from '../auth/owner.js';
import { pageInfo } from '../common/pagination.js';
import { ApiErrors, SECURITY } from '../common/swagger.js';
import { PrismaService } from '../database/prisma.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import {
  ArticleDto,
  ArticleListQueryDto,
  ArticlePageDto,
  LocaleQueryDto,
} from './content.dto.js';
import { toArticle, toSummary } from './content.mapper.js';

@ApiTags('content')
@ApiBearerAuth(SECURITY.bearer)
@ApiCookieAuth(SECURITY.cookie)
@ApiSecurity(SECURITY.anonymous)
@ApiSecurity({})
@OptionalAuth('Published articles are public; a session only adds entitlement')
@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List published articles',
    description:
      'Public. Only the published version of each article is listed. Filter by category, trimester (includes content that applies throughout) and tag.',
  })
  @ApiOkResponse({ type: ArticlePageDto })
  @ApiErrors(400)
  async list(@Query() q: ArticleListQueryDto) {
    const where = {
      kind: 'article' as const,
      locale: q.locale,
      status: 'published' as const,
      ...(q.category && { category: q.category }),
      ...(q.trimester && {
        OR: [{ trimester: q.trimester }, { trimester: null }],
      }),
      ...(q.tag && { tags: { has: q.tag } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }],
        take: q.limit,
        skip: q.offset,
      }),
      this.prisma.article.count({ where }),
    ]);
    return { items: rows.map(toSummary), page: pageInfo(q, total) };
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Read a published article',
    description:
      'Public. Premium bodies are returned only to callers with an active entitlement; others get `locked: true` and `body: null`. Includes the clinical review that approved this version.',
  })
  @ApiOkResponse({ type: ArticleDto })
  @ApiErrors(401, 404)
  async get(
    @Param('slug', ParseSlugPipe) slug: string,
    @Query() q: LocaleQueryDto,
    @MaybeOwner() owner?: Owner,
  ): Promise<Article> {
    const row = await this.prisma.article.findFirst({
      where: { kind: 'article', slug, locale: q.locale, status: 'published' },
    });
    if (!row) throw new NotFoundException('Article not found.');
    const review = await this.prisma.contentReview.findFirst({
      where: { articleId: row.id, decision: 'approved' },
      orderBy: { reviewedAt: 'desc' },
    });
    const locked =
      row.premium && !(await this.entitlements.canAccessPremium(owner));
    return toArticle(row, review, locked);
  }
}
