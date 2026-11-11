import { ThrottleWrite } from '../common/throttle.js';
import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import {
  LOCAL_TIME_PATTERN,
  RECURRENCE_PATTERN,
  type Reminder,
  ReminderChannel,
  type ReminderDeliveryOptions,
  ReminderKind,
} from '@preconception/contracts';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CurrentOwner, Staff } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { ApiErrors, ApiOwnerAuth, ApiUserAuth } from '../common/swagger.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Reminder as ReminderRow } from '../generated/prisma/client.js';
import { ReminderDeliveryService } from './reminder-delivery.service.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';

/** Plenty for real use; stops a client from creating unbounded rows. */
const MAX_REMINDERS = 20;

class CreateReminderDto {
  @ApiProperty({ enum: ReminderKind.options })
  @IsIn(ReminderKind.options)
  kind: ReminderKind;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({
    example: '08:30',
    description: 'Local wall-clock HH:MM in the profile time zone',
  })
  @Matches(LOCAL_TIME_PATTERN, { message: 'localTime must be HH:MM (24h)' })
  localTime: string;

  @ApiProperty({
    example: 'FREQ=WEEKLY;BYDAY=MO,TH',
    description: 'FREQ=DAILY or FREQ=WEEKLY;BYDAY=…',
  })
  @Matches(RECURRENCE_PATTERN, {
    message: 'recurrence must be FREQ=DAILY or FREQ=WEEKLY;BYDAY=MO,...',
  })
  recurrence: string;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 60,
    description:
      'Lock-screen text. Defaults avoid health details; keep custom labels discreet.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  label?: string | null;

  @ApiPropertyOptional({
    enum: ReminderChannel.options,
    default: 'none',
    description:
      "`email` sends the reminder to the account's confirmed address. Needs an account, a " +
      'confirmed email and delivery switched on (see GET /v1/reminders/delivery-options).',
  })
  @IsOptional()
  @IsIn(ReminderChannel.options)
  channel?: ReminderChannel;
}

class UpdateReminderDto extends PartialType(CreateReminderDto) {}

class ReminderDto implements Reminder {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ReminderKind.options }) kind: ReminderKind;
  @ApiProperty() enabled: boolean;
  @ApiProperty({ example: '08:30' }) localTime: string;
  @ApiProperty({ example: 'FREQ=DAILY' }) recurrence: string;
  @ApiProperty({ nullable: true, type: String }) label: string | null;
  @ApiProperty({ enum: ReminderChannel.options }) channel: ReminderChannel;
  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Next scheduled send; null when paused or in-app only',
  })
  nextRunAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

class ReminderDeliveryOptionsDto implements ReminderDeliveryOptions {
  @ApiProperty({ enum: ['email'], isArray: true }) channels: 'email'[];
  @ApiProperty() emailVerified: boolean;
}

@ApiTags('reminders')
@ApiOwnerAuth()
@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ReminderScheduleService,
  ) {}

  @Get('delivery-options')
  @ApiOperation({
    summary: 'Which delivery channels can be used',
    description:
      'Empty `channels` means reminders are in-app only on this deployment or for this owner.',
  })
  @ApiOkResponse({ type: ReminderDeliveryOptionsDto })
  deliveryOptions(@CurrentOwner() owner: Owner): ReminderDeliveryOptions {
    const isUser = owner.kind === 'user';
    return {
      channels: isUser && this.schedule.emailDeliveryAvailable ? ['email'] : [],
      emailVerified: isUser && owner.user.emailVerified,
    };
  }

  /** Throws when `email` can't be used by this owner on this deployment. */
  private assertChannel(owner: Owner, channel: ReminderChannel | undefined) {
    if (channel !== 'email') return;
    if (owner.kind !== 'user') {
      throw new BadRequestException(['Email reminders need an account.']);
    }
    if (!this.schedule.emailDeliveryAvailable) {
      throw new ConflictException('Email reminders are not available yet.');
    }
    if (!owner.user.emailVerified) {
      throw new ConflictException(
        'Confirm your email address to get reminders by email.',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'List reminders' })
  @ApiOkResponse({ type: [ReminderDto] })
  async list(@CurrentOwner() owner: Owner): Promise<Reminder[]> {
    const rows = await this.prisma.reminder.findMany({
      where: ownerWhere(owner),
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  @ThrottleWrite('ownerWrite')
  @Post()
  @ApiOperation({
    summary: 'Create a reminder',
    description: `At most ${MAX_REMINDERS} per owner.`,
  })
  @ApiCreatedResponse({ type: ReminderDto })
  @ApiErrors(400, 409)
  async create(
    @CurrentOwner() owner: Owner,
    @Body() dto: CreateReminderDto,
  ): Promise<Reminder> {
    const count = await this.prisma.reminder.count({
      where: ownerWhere(owner),
    });
    if (count >= MAX_REMINDERS) {
      throw new ConflictException(
        `At most ${MAX_REMINDERS} reminders are allowed.`,
      );
    }
    this.assertChannel(owner, dto.channel);
    const settings = {
      enabled: dto.enabled ?? true,
      channel: dto.channel ?? 'none',
      localTime: dto.localTime,
      recurrence: dto.recurrence,
    };
    const nextRunAt =
      owner.kind === 'user' && settings.channel === 'email'
        ? this.schedule.nextRunAt(
            settings,
            await this.schedule.timeZoneFor(owner.id),
          )
        : null;
    const row = await this.prisma.reminder.create({
      data: {
        ...ownerWhere(owner),
        ...settings,
        kind: dto.kind,
        label: dto.label ?? null,
        nextRunAt,
      },
    });
    return toDto(row);
  }

  @ThrottleWrite('ownerWrite')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a reminder' })
  @ApiOkResponse({ type: ReminderDto })
  @ApiErrors(400, 404, 409)
  async update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderDto,
  ): Promise<Reminder> {
    const existing = await this.prisma.reminder.findFirst({
      where: { id, ...ownerWhere(owner) },
    });
    if (!existing) throw new NotFoundException('Reminder not found.');
    if (dto.channel && dto.channel !== existing.channel) {
      this.assertChannel(owner, dto.channel);
    }
    const settings = { ...existing, ...stripUndefined(dto) };
    const row = await this.prisma.$transaction(async (tx) => {
      const nextRunAt =
        owner.kind === 'user' && settings.channel === 'email'
          ? this.schedule.nextRunAt(
              settings,
              await this.schedule.timeZoneFor(owner.id, tx),
            )
          : null;
      // Anything queued for the old settings must not go out.
      await this.schedule.cancelQueued([id], 'REMINDER_CHANGED', tx);
      // owner-scope: `existing` was found with ownerWhere above (else 404)
      return tx.reminder.update({
        where: { id },
        data: {
          kind: dto.kind,
          enabled: dto.enabled,
          localTime: dto.localTime,
          recurrence: dto.recurrence,
          label: dto.label,
          channel: dto.channel,
          nextRunAt,
        },
      });
    });
    return toDto(row);
  }

  @ThrottleWrite('ownerWrite')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a reminder' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { count } = await this.prisma.reminder.deleteMany({
      where: { id, ...ownerWhere(owner) },
    });
    if (count === 0) throw new NotFoundException('Reminder not found.');
  }
}

function toDto(row: ReminderRow): Reminder {
  return {
    id: row.id,
    kind: row.kind as ReminderKind,
    enabled: row.enabled,
    localTime: row.localTime,
    recurrence: row.recurrence,
    label: row.label,
    channel: row.channel,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

@ApiTags('admin')
@ApiUserAuth()
@Staff('support')
@Controller('admin/reminder-deliveries')
export class AdminReminderDeliveriesController {
  constructor(private readonly delivery: ReminderDeliveryService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Reminder delivery counts for the last 24 hours',
    description:
      'Staff (support and above). Counts only: no content or addresses.',
  })
  @ApiErrors(403)
  stats() {
    return this.delivery.stats();
  }
}
