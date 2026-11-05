import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ContentKind, SavedItem } from '@preconception/contracts';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { PrismaService } from '../database/prisma.service.js';
import type { SavedContent } from '../generated/prisma/client.js';
import { findOrCreate } from './idempotent.js';
import { SavedItemDto, SavedParams, SavedQueryDto } from './planning.dto.js';

const MAX_SAVED = 500;

@ApiTags('saved')
@ApiOwnerAuth()
@Controller('saved')
export class SavedController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'My saved articles, recipes, activities and meal plans',
    description:
      'Newest first. Items are kept by slug, so they follow new published versions.',
  })
  @ApiOkResponse({ type: [SavedItemDto] })
  @ApiErrors(400)
  async list(
    @CurrentOwner() owner: Owner,
    @Query() q: SavedQueryDto,
  ): Promise<SavedItem[]> {
    const rows = await this.prisma.savedContent.findMany({
      where: { ...ownerWhere(owner), ...(q.kind && { kind: q.kind }) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSaved);
  }

  @Put(':kind/:slug')
  @ApiOperation({
    summary: 'Save an item',
    description: 'Idempotent. The item must be published.',
  })
  @ApiOkResponse({ type: SavedItemDto })
  @ApiErrors(400, 404)
  async save(
    @CurrentOwner() owner: Owner,
    @Param() p: SavedParams,
  ): Promise<SavedItem> {
    const published = await this.prisma.article.findFirst({
      where: { kind: p.kind, slug: p.slug, status: 'published' },
      select: { id: true },
    });
    if (!published)
      throw new NotFoundException('Nothing published with that kind and slug.');
    const where = { ...ownerWhere(owner), kind: p.kind, slug: p.slug };
    const row = await findOrCreate(
      () => this.prisma.savedContent.findFirst({ where }),
      async () => {
        if (
          (await this.prisma.savedContent.count({
            where: ownerWhere(owner),
          })) >= MAX_SAVED
        ) {
          throw new BadRequestException([
            `you can save at most ${MAX_SAVED} items`,
          ]);
        }
        return this.prisma.savedContent.create({ data: where });
      },
    );
    return toSaved(row);
  }

  @Delete(':kind/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a saved item' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param() p: SavedParams,
  ): Promise<void> {
    const { count } = await this.prisma.savedContent.deleteMany({
      where: { ...ownerWhere(owner), kind: p.kind, slug: p.slug },
    });
    if (count === 0) throw new NotFoundException('Not saved.');
  }
}

function toSaved(row: SavedContent): SavedItem {
  return {
    kind: row.kind as ContentKind,
    slug: row.slug,
    savedAt: row.createdAt.toISOString(),
  };
}
