import {
  ENCRYPTED_COLUMNS,
  type FieldCipher,
  FieldCipherService,
} from '../database/field-cipher.js';
import { ThrottleWrite } from '../common/throttle.js';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { NOTE_MAX_LENGTH, type ReadinessTask } from '@preconception/contracts';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { premiumRequired } from '../common/errors.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import type {
  Article,
  ReadinessTask as TaskRow,
  UserTaskProgress,
} from '../generated/prisma/client.js';
import { LocaleQueryDto } from './content.dto.js';
import { inWeekWindow, PregnancyContext } from '../common/pregnancy-context.js';

class TaskListQueryDto extends LocaleQueryDto {
  @ApiPropertyOptional({
    example: 'hospital_bag',
    description:
      'Only tasks in this category (see PreparationCategory in contracts for the newborn and birth lists)',
  })
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,40}$/)
  category?: string;
}

export class ReadinessTaskDto implements ReadinessTask {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'start-folic-acid' }) key: string;
  @ApiProperty() title: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Null when premium and locked',
  })
  description: string | null;
  @ApiProperty({ example: 'nutrition' }) category: string;
  @ApiProperty() premium: boolean;
  @ApiProperty() locked: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Linked published article',
  })
  articleSlug: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  completedAt: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Private note. Never logged.',
  })
  note: string | null;
  @ApiProperty({ nullable: true, type: Number, minimum: 1, maximum: 42 })
  fromWeek: number | null;
  @ApiProperty({ nullable: true, type: Number, minimum: 1, maximum: 42 })
  toWeek: number | null;
  @ApiProperty({
    nullable: true,
    type: Boolean,
    description:
      "True when today's pregnancy week is inside the task's window; null without an active pregnancy or window",
  })
  recommendedNow: boolean | null;
}

class PutProgressDto {
  @ApiProperty()
  @IsBoolean()
  completed: boolean;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: NOTE_MAX_LENGTH,
    description: 'Personal notes or questions for a clinician',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string | null;
}

export type TaskWithArticle = TaskRow & { article: Article | null };

@ApiTags('readiness')
@ApiOwnerAuth()
@Controller('readiness/tasks')
export class ReadinessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipherService,
    private readonly consent: ConsentService,
    private readonly entitlements: EntitlementsService,
    private readonly pregnancy: PregnancyContext,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Preparation plan with my progress',
    description:
      'Published tasks in display order. Premium tasks are locked without an entitlement. With an active pregnancy, `recommendedNow` marks tasks whose week window includes this week; nothing is hidden.',
  })
  @ApiOkResponse({ type: [ReadinessTaskDto] })
  @ApiErrors(400)
  async list(
    @CurrentOwner() owner: Owner,
    @Query() q: TaskListQueryDto,
  ): Promise<ReadinessTask[]> {
    const [tasks, premium, active] = await Promise.all([
      this.prisma.readinessTask.findMany({
        where: {
          locale: q.locale,
          status: 'published',
          ...(q.category && { category: q.category }),
        },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        include: { article: true },
      }),
      this.entitlements.canAccessPremium(owner),
      this.pregnancy.active(owner),
    ]);
    const progress = await this.prisma.userTaskProgress.findMany({
      where: { ...ownerWhere(owner), taskId: { in: tasks.map((t) => t.id) } },
    });
    const byTask = new Map(progress.map((p) => [p.taskId, p]));
    return tasks.map((t) =>
      toReadinessTask(
        t,
        byTask.get(t.id),
        t.premium && !premium,
        active?.week ?? null,
        this.cipher,
      ),
    );
  }

  @ThrottleWrite('ownerWrite')
  @Put(':taskId/progress')
  @ApiOperation({
    summary: 'Mark a task done or not, with an optional private note',
    description:
      'Requires health_data_processing consent. Premium tasks need an entitlement.',
  })
  @ApiOkResponse({ type: ReadinessTaskDto })
  @ApiErrors(400, 403, 404)
  async putProgress(
    @CurrentOwner() owner: Owner,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: PutProgressDto,
  ): Promise<ReadinessTask> {
    const task = await this.prisma.readinessTask.findFirst({
      where: { id: taskId, status: 'published' },
      include: { article: true },
    });
    if (!task) throw new NotFoundException('Task not found.');
    if (task.premium && !(await this.entitlements.canAccessPremium(owner))) {
      throw premiumRequired();
    }
    await this.consent.assertHealthDataConsent(owner);

    const data = {
      completedAt: dto.completed ? new Date() : null,
      note: this.cipher.encrypt(dto.note ?? null, ENCRYPTED_COLUMNS.taskNote),
    };
    const existing = await this.prisma.userTaskProgress.findFirst({
      where: { ...ownerWhere(owner), taskId },
    });
    const row = existing
      ? // owner-scope: `existing` was found with ownerWhere above
        await this.prisma.userTaskProgress.update({
          where: { id: existing.id },
          // Keep the original completion time when re-saving a completed task.
          data: {
            ...data,
            completedAt: dto.completed
              ? (existing.completedAt ?? new Date())
              : null,
          },
        })
      : await this.prisma.userTaskProgress.create({
          data: { ...ownerWhere(owner), taskId, ...data },
        });
    return toReadinessTask(
      task,
      row,
      false,
      (await this.pregnancy.active(owner))?.week ?? null,
      this.cipher,
    );
  }
}

export function toReadinessTask(
  task: TaskWithArticle,
  progress: UserTaskProgress | undefined,
  locked: boolean,
  week: number | null,
  cipher: FieldCipher,
): ReadinessTask {
  return {
    id: task.id,
    key: task.key,
    title: task.title,
    description: locked ? null : task.description,
    category: task.category,
    premium: task.premium,
    locked,
    articleSlug:
      task.article?.status === 'published' ? task.article.slug : null,
    completedAt: progress?.completedAt?.toISOString() ?? null,
    note: cipher.decrypt(progress?.note ?? null, ENCRYPTED_COLUMNS.taskNote),
    fromWeek: task.fromWeek,
    toWeek: task.toWeek,
    recommendedNow:
      week === null ? null : inWeekWindow(week, task.fromWeek, task.toWeek),
  };
}
