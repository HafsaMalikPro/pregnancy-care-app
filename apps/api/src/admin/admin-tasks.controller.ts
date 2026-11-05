import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Staff } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/owner.js';
import { ApiErrors, ApiUserAuth } from '../common/swagger.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ContentStatus,
  ReadinessTask,
} from '../generated/prisma/client.js';
import { AdminTaskDto, CreateTaskDto, UpdateTaskDto } from './admin.dto.js';

@ApiTags('admin')
@ApiUserAuth()
@ApiErrors(403)
@Staff('content_editor', 'clinical_reviewer')
@Controller('admin/readiness-tasks')
export class AdminTasksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all readiness tasks (all statuses)' })
  @ApiOkResponse({ type: [AdminTaskDto] })
  list() {
    return this.prisma.readinessTask.findMany({
      orderBy: [{ locale: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  @Post()
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Create a draft task',
    description:
      'Roles: content_editor, administrator. 409 for a duplicate key.',
  })
  @ApiCreatedResponse({ type: AdminTaskDto })
  @ApiErrors(400, 409)
  async create(
    @CurrentUser() actor: SessionUser,
    @Body() dto: CreateTaskDto,
    @Req() req: Request,
  ) {
    const task = await this.prisma.readinessTask.create({
      data: {
        key: dto.key,
        locale: dto.locale,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        sortOrder: dto.sortOrder,
        premium: dto.premium,
        articleId: dto.articleId ?? null,
        fromWeek: dto.fromWeek ?? null,
        toWeek: dto.toWeek ?? null,
        status: 'draft',
      },
    });
    await this.log(actor, 'readiness_task.created', task, req.requestId);
    return task;
  }

  @Patch(':id')
  @Staff('content_editor')
  @ApiOperation({
    summary: 'Edit a task',
    description:
      'Editing a published task returns it to draft so the change is reviewed before it is shown again.',
  })
  @ApiOkResponse({ type: AdminTaskDto })
  @ApiErrors(400, 404, 409)
  async update(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: Request,
  ) {
    await this.find(id);
    const task = await this.prisma.readinessTask.update({
      where: { id },
      data: { ...taskFields(dto), status: 'draft' },
    });
    await this.log(actor, 'readiness_task.updated', task, req.requestId);
    return task;
  }

  @Post(':id/publish')
  @Staff('clinical_reviewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a task after clinical review',
    description: 'Roles: clinical_reviewer, administrator.',
  })
  @ApiOkResponse({ type: AdminTaskDto })
  @ApiErrors(400, 404, 409)
  publish(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.setStatus(
      actor,
      id,
      ['draft', 'approved', 'in_review'],
      'published',
      req.requestId,
    );
  }

  @Post(':id/archive')
  @Staff('content_editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a task (hides it from the plan)' })
  @ApiOkResponse({ type: AdminTaskDto })
  @ApiErrors(400, 404, 409)
  archive(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.setStatus(
      actor,
      id,
      ['draft', 'in_review', 'approved', 'published'],
      'archived',
      req.requestId,
    );
  }

  private async setStatus(
    actor: SessionUser,
    id: string,
    from: ContentStatus[],
    to: ContentStatus,
    requestId?: string,
  ) {
    const existing = await this.find(id);
    if (!from.includes(existing.status)) {
      throw new ConflictException(
        `Task cannot move from ${existing.status} to ${to}.`,
      );
    }
    const task = await this.prisma.readinessTask.update({
      where: { id },
      data: { status: to },
    });
    await this.log(actor, `readiness_task.${to}`, task, requestId);
    return task;
  }

  private async find(id: string): Promise<ReadinessTask> {
    const task = await this.prisma.readinessTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  private log(
    actor: SessionUser,
    action: string,
    task: ReadinessTask,
    requestId?: string,
  ) {
    return this.audit.record({
      action,
      actorUserId: actor.id,
      actorRole: actor.staffRole,
      targetType: 'readiness_task',
      targetId: task.id,
      requestId,
      metadata: { key: task.key, locale: task.locale },
    });
  }
}

/** The editable task fields; undefined ones are left unchanged by Prisma. */
function taskFields(dto: UpdateTaskDto) {
  return {
    title: dto.title,
    description: dto.description,
    category: dto.category,
    sortOrder: dto.sortOrder,
    fromWeek: dto.fromWeek,
    toWeek: dto.toWeek,
    premium: dto.premium,
    articleId: dto.articleId,
  };
}
