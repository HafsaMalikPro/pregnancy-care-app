import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
  Prisma,
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
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.readinessTask.create({
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
      await this.log(tx, actor, 'readiness_task.created', task, req.requestId);
      return task;
    });
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
    return this.prisma.$transaction(async (tx) => {
      await this.find(id, tx);
      const task = await tx.readinessTask.update({
        where: { id },
        data: { ...taskFields(dto), status: 'draft' },
      });
      await this.log(tx, actor, 'readiness_task.updated', task, req.requestId);
      return task;
    });
  }

  @Post(':id/publish')
  @Staff('clinical_reviewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a task after clinical review',
    description:
      'Roles: clinical_reviewer, administrator. The reviewer cannot be someone who created or edited this version of the task (403).',
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
    return this.prisma.$transaction(async (tx) => {
      // Lock the row so a concurrent edit can't slip in between the checks and the change.
      await tx.$queryRaw`SELECT id FROM readiness_tasks WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await this.find(id, tx);
      if (!from.includes(existing.status)) {
        throw new ConflictException(
          `Task cannot move from ${existing.status} to ${to}.`,
        );
      }
      if (to === 'published') await this.assertNotAuthor(tx, actor, id);
      const task = await tx.readinessTask.update({
        where: { id },
        data: { status: to },
      });
      await this.log(tx, actor, `readiness_task.${to}`, task, requestId);
      return task;
    });
  }

  /**
   * Separation of duties: tasks are edited in place, so "this version" is everything since the
   * task was last published. Whoever created or edited it in that time cannot publish it.
   */
  private async assertNotAuthor(
    tx: Prisma.TransactionClient,
    actor: SessionUser,
    id: string,
  ) {
    const lastPublished = await tx.auditEvent.findFirst({
      where: {
        targetType: 'readiness_task',
        targetId: id,
        action: 'readiness_task.published',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (
      await this.audit.touched(
        tx,
        actor.id,
        'readiness_task',
        id,
        ['readiness_task.created', 'readiness_task.updated'],
        lastPublished?.createdAt,
      )
    ) {
      throw new ForbiddenException(
        'You cannot publish a task you created or edited; another reviewer must publish it.',
      );
    }
  }

  private async find(
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<ReadinessTask> {
    const task = await db.readinessTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: SessionUser,
    action: string,
    task: ReadinessTask,
    requestId?: string,
  ) {
    return this.audit.record(
      {
        action,
        actorUserId: actor.id,
        actorRole: actor.staffRole,
        targetType: 'readiness_task',
        targetId: task.id,
        requestId,
        metadata: { key: task.key, locale: task.locale },
      },
      tx,
    );
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
