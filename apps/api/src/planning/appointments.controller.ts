import {
  BadRequestException,
  Body,
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
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Appointment, AppointmentKind } from '@preconception/contracts';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Appointment as AppointmentRow } from '../generated/prisma/client.js';
import {
  AppointmentDto,
  AppointmentQueryDto,
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './planning.dto.js';

const MAX_APPOINTMENTS = 200;
const YEAR_MS = 366 * 86_400_000;

@ApiTags('appointments')
@ApiOwnerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'My appointments',
    description:
      'Upcoming by default (from now), soonest first. Pass from/to for a range of at most one year.',
  })
  @ApiOkResponse({ type: [AppointmentDto] })
  @ApiErrors(400)
  async list(
    @CurrentOwner() owner: Owner,
    @Query() q: AppointmentQueryDto,
  ): Promise<Appointment[]> {
    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + YEAR_MS);
    if (to < from) throw new BadRequestException(['to must be after from']);
    if (to.getTime() - from.getTime() > YEAR_MS)
      throw new BadRequestException(['range must be at most a year']);
    const rows = await this.prisma.appointment.findMany({
      where: { ...ownerWhere(owner), startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toAppointment);
  }

  @Post()
  @ApiOperation({
    summary: 'Add an appointment',
    description:
      'Linked to your active pregnancy, if any. Requires health_data_processing consent. To be reminded, add a reminder; appointments themselves send nothing.',
  })
  @ApiCreatedResponse({ type: AppointmentDto })
  @ApiErrors(400, 403)
  async create(
    @CurrentOwner() owner: Owner,
    @Body() dto: CreateAppointmentDto,
  ): Promise<Appointment> {
    await this.consent.assertHealthDataConsent(owner);
    if (
      (await this.prisma.appointment.count({ where: ownerWhere(owner) })) >=
      MAX_APPOINTMENTS
    ) {
      throw new BadRequestException([
        `you can keep at most ${MAX_APPOINTMENTS} appointments`,
      ]);
    }
    const pregnancy = await this.prisma.pregnancy.findFirst({
      where: { ...ownerWhere(owner), status: 'active' },
      select: { id: true },
    });
    const row = await this.prisma.appointment.create({
      data: {
        ...ownerWhere(owner),
        pregnancyId: pregnancy?.id ?? null,
        kind: dto.kind,
        title: dto.title.trim(),
        startsAt: new Date(dto.startsAt),
        location: dto.location ?? null,
        notes: dto.notes ?? null,
        questions: dto.questions ?? [],
      },
    });
    return toAppointment(row);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One appointment' })
  @ApiOkResponse({ type: AppointmentDto })
  @ApiErrors(400, 404)
  async get(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Appointment> {
    return toAppointment(await this.find(owner, id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change an appointment',
    description: 'Requires health_data_processing consent.',
  })
  @ApiOkResponse({ type: AppointmentDto })
  @ApiErrors(400, 403, 404)
  async update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    await this.consent.assertHealthDataConsent(owner);
    await this.find(owner, id);
    const row = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.questions !== undefined && { questions: dto.questions }),
      },
    });
    return toAppointment(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an appointment' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const { count } = await this.prisma.appointment.deleteMany({
      where: { id, ...ownerWhere(owner) },
    });
    if (count === 0) throw new NotFoundException('Appointment not found.');
  }

  /** Owner-scoped lookup: someone else's id is indistinguishable from a missing one. */
  private async find(owner: Owner, id: string) {
    const row = await this.prisma.appointment.findFirst({
      where: { id, ...ownerWhere(owner) },
    });
    if (!row) throw new NotFoundException('Appointment not found.');
    return row;
  }
}

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    kind: row.kind as AppointmentKind,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    location: row.location,
    notes: row.notes,
    questions: row.questions,
    pregnancyId: row.pregnancyId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
