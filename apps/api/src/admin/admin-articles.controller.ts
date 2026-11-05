import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, Staff } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/owner.js';
import { pageInfo } from '../common/pagination.js';
import { ApiErrors, ApiUserAuth } from '../common/swagger.js';
import { PrismaService } from '../database/prisma.service.js';
import { AdminContentService } from './admin-content.service.js';
import {
  AdminArticleDto,
  AdminArticlePageDto,
  ArticleAdminQueryDto,
  CreateArticleDto,
  ReviewArticleDto,
  UpdateArticleDto,
} from './admin.dto.js';

@ApiTags('admin')
@ApiUserAuth()
@ApiErrors(403)
@Staff('content_editor', 'clinical_reviewer')
@Controller('admin/articles')
export class AdminArticlesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: AdminContentService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List content versions (all kinds and statuses)',
    description:
      'Roles: content_editor, clinical_reviewer, administrator. Filter by status, kind, category, slug or a title/slug search. Every version is kept, so filtering by slug gives the revision history.',
  })
  @ApiOkResponse({ type: AdminArticlePageDto })
  async list(@Query() q: ArticleAdminQueryDto) {
    const where = {
      ...(q.status && { status: q.status }),
      ...(q.slug && { slug: q.slug }),
      ...(q.kind && { kind: q.kind }),
      ...(q.category && { category: q.category }),
      ...(q.q && {
        OR: [
          { title: { contains: q.q, mode: 'insensitive' as const } },
          { slug: { contains: q.q.toLowerCase() } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        take: q.limit,
        skip: q.offset,
      }),
      this.prisma.article.count({ where }),
    ]);
    return { items, page: pageInfo(q, total) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one article version with its reviews' })
  @ApiOkResponse({ type: AdminArticleDto })
  @ApiErrors(400, 404)
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: { reviews: { orderBy: { createdAt: 'desc' } } },
    });
    if (!article) throw new NotFoundException('Article not found.');
    return article;
  }

  @Post()
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create a draft (new article or new version)',
    description:
      'Roles: content_editor, administrator. 409 if a working version already exists.',
  })
  @ApiCreatedResponse({ type: AdminArticleDto })
  @ApiErrors(400, 409)
  create(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateArticleDto,
    @Req() req: Request,
  ) {
    return this.content.createDraft(actor, dto, req.requestId);
  }

  @Patch(':id')
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Edit a draft',
    description: 'Roles: content_editor, administrator.',
  })
  @ApiOkResponse({ type: AdminArticleDto })
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @Req() req: Request,
  ) {
    return this.content.updateDraft(actor, id, dto, req.requestId);
  }

  @Post(':id/submit')
  @Staff('content_editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a draft for clinical review' })
  @ApiOkResponse({ type: AdminArticleDto })
  @ApiErrors(400, 404, 409)
  submit(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.content.submit(actor, id, req.requestId);
  }

  @Post(':id/reviews')
  @Staff('clinical_reviewer')
  @ApiOperation({
    summary: 'Record a clinical review decision',
    description:
      'Roles: clinical_reviewer, administrator. Authors cannot review their own article (403).',
  })
  @ApiCreatedResponse({
    description: 'Review recorded; article moves to approved or back to draft',
  })
  @ApiErrors(400, 404, 409)
  review(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewArticleDto,
    @Req() req: Request,
  ) {
    return this.content.review(actor, id, dto, req.requestId);
  }

  @Post(':id/publish')
  @Staff('content_editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish an approved version',
    description:
      'Archives the previously published version of the same slug and locale. Next review due in 12 months.',
  })
  @ApiOkResponse({ type: AdminArticleDto })
  @ApiErrors(400, 404, 409)
  publish(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.content.publish(actor, id, req.requestId);
  }

  @Post(':id/archive')
  @Staff('content_editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a version (unpublishes it if published)' })
  @ApiOkResponse({ type: AdminArticleDto })
  @ApiErrors(400, 404, 409)
  archive(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.content.archive(actor, id, req.requestId);
  }
}
