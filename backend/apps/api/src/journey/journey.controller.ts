import { FieldCipherService } from '../database/field-cipher.js';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  AppointmentKind,
  type PersonalVisit,
  type PostpartumGuide,
  type PostpartumStatus,
  SUPPORTED_LOCALES,
  type VisitSchedule,
} from '@preconception/contracts';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CurrentOwner, Public } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { toIsoDate } from '../common/dates.js';
import { JourneyStage } from '../common/journey-stage.js';
import { PregnancyContext } from '../common/pregnancy-context.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ArticleReviewDto } from '../content/content.dto.js';
import { ContentBaseDto } from '../content/catalog.dto.js';
import {
  CatalogService,
  toPostpartumGuide,
  toVisitSchedule,
} from '../content/catalog.service.js';
import {
  ReadinessTaskDto,
  toReadinessTask,
} from '../content/readiness.controller.js';
import { PrismaService } from '../database/prisma.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import {
  chooseSchedules,
  personalVisits,
  POSTPARTUM_DISCLAIMER,
  postpartumWeek,
} from './journey.js';

type Locale = (typeof SUPPORTED_LOCALES)[number];

class LocaleQuery {
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale: Locale = 'en';
}

class VisitScheduleQuery extends LocaleQuery {
  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2; also returns general schedules',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}

class VisitDto {
  @ApiProperty() key: string;
  @ApiProperty() title: string;
  @ApiProperty() fromWeek: number;
  @ApiProperty() toWeek: number;
  @ApiProperty() purpose: string;
  @ApiProperty({ type: [String] }) typicalChecks: string[];
  @ApiProperty({ enum: AppointmentKind.options })
  appointmentKind: AppointmentKind;
}

class VisitScheduleSectionsDto {
  @ApiProperty({ enum: [1, 2, 3] }) trimester: 1 | 2 | 3;
  @ApiProperty({ nullable: true, type: String }) countryCode: string | null;
  @ApiProperty({ type: [VisitDto] }) visits: VisitDto[];
}

class VisitScheduleDto extends ContentBaseDto {
  @ApiProperty({ type: VisitScheduleSectionsDto })
  sections: VisitScheduleSectionsDto;
}

class PersonalVisitDto implements PersonalVisit {
  @ApiProperty() scheduleSlug: string;
  @ApiProperty() key: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: [1, 2, 3] }) trimester: 1 | 2 | 3;
  @ApiProperty() fromWeek: number;
  @ApiProperty() toWeek: number;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) endDate: string;
  @ApiProperty({ enum: ['past', 'current', 'upcoming'] }) status:
    'past' | 'current' | 'upcoming';
  @ApiProperty() purpose: string;
  @ApiProperty({ type: [String] }) typicalChecks: string[];
  @ApiProperty({ enum: AppointmentKind.options })
  appointmentKind: AppointmentKind;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  bookedAppointmentId: string | null;
  @ApiProperty({ type: ArticleReviewDto, nullable: true })
  review: ArticleReviewDto | null;
}

class PostpartumSectionsDto {
  @ApiProperty({ minimum: 1, maximum: 6 }) week: number;
  @ApiProperty() body: string;
  @ApiProperty({ type: [String] }) recovery: string[];
  @ApiProperty({ type: [String] }) feeding: string[];
  @ApiProperty({ type: [String] }) emotionalWellbeing: string[];
  @ApiProperty({ type: [String] }) babyCare: string[];
  @ApiProperty({ type: [String] }) whenToGetHelp: string[];
  @ApiProperty({ type: [String] }) askAtCheck: string[];
  @ApiProperty({ type: [String] }) checklist: string[];
}

class PostpartumGuideDto extends ContentBaseDto {
  @ApiProperty({ type: PostpartumSectionsDto }) sections: PostpartumSectionsDto;
}

class PostpartumStatusDto implements PostpartumStatus {
  @ApiProperty({ format: 'uuid' }) pregnancyId: string;
  @ApiProperty({ format: 'date' }) birthDate: string;
  @ApiProperty({ format: 'date' }) today: string;
  @ApiProperty() daysSinceBirth: number;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: '1-6, null after six weeks',
  })
  week: number | null;
  @ApiProperty({ type: PostpartumGuideDto, nullable: true })
  guide: PostpartumGuideDto | null;
  @ApiProperty({ type: [ReadinessTaskDto] }) recoveryTasks: ReadinessTaskDto[];
  @ApiProperty() disclaimer: string;
}

@ApiTags('pregnancy')
@Controller()
export class JourneyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipherService,
    private readonly catalog: CatalogService,
    private readonly journey: JourneyStage,
    private readonly pregnancy: PregnancyContext,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('visit-schedules')
  @Public('Published prenatal visit schedules are public content')
  @ApiOperation({
    summary: 'Published prenatal visit schedules',
    description:
      'Public. Clinically reviewed templates, one or more per trimester. With countryCode, schedules for that country and general ones.',
  })
  @ApiOkResponse({ type: [VisitScheduleDto] })
  @ApiErrors(400)
  async visitSchedules(
    @Query() q: VisitScheduleQuery,
  ): Promise<VisitSchedule[]> {
    const { rows, reviews } = await this.catalog.published(
      'visit_schedule',
      q.locale,
    );
    return rows
      .map((r) => toVisitSchedule(r, reviews.get(r.id) ?? null))
      .filter(
        (s) =>
          !q.countryCode ||
          s.sections.countryCode === null ||
          s.sections.countryCode === q.countryCode,
      );
  }

  @Get('pregnancies/current/visit-schedule')
  @ApiOwnerAuth()
  @ApiOperation({
    summary: 'The prenatal visit schedule on my pregnancy dates',
    description:
      "Published visit templates mapped onto the active pregnancy's weeks, with any appointment of the same kind booked in each window. Uses the profile country's schedule when one exists, else the general one. Empty when none is published.",
  })
  @ApiOkResponse({ type: [PersonalVisitDto] })
  @ApiErrors(404)
  async myVisits(
    @CurrentOwner() owner: Owner,
    @Query() q: LocaleQuery,
  ): Promise<PersonalVisit[]> {
    const active = await this.pregnancy.active(owner);
    if (!active) throw new NotFoundException('No active pregnancy.');
    const [{ rows, reviews }, profile, appointments] = await Promise.all([
      this.catalog.published('visit_schedule', q.locale),
      this.prisma.profile.findFirst({
        where: ownerWhere(owner),
        select: { countryCode: true },
      }),
      this.prisma.appointment.findMany({
        where: { ...ownerWhere(owner), pregnancyId: active.row.id },
        select: { id: true, kind: true, startsAt: true },
      }),
    ]);
    const schedules = chooseSchedules(
      rows.map((r) => toVisitSchedule(r, reviews.get(r.id) ?? null)),
      profile?.countryCode ?? null,
    );
    return personalVisits(
      schedules,
      toIsoDate(active.row.dueDate),
      active.today,
      appointments.map((a) => ({
        id: a.id,
        kind: a.kind as AppointmentKind,
        startsAt: a.startsAt.toISOString(),
      })),
    );
  }

  @Get('postpartum-guides/:week')
  @Public('Published postpartum guides are public content')
  @ApiOperation({
    summary: 'Published postpartum guide for a week after birth (1-6)',
  })
  @ApiOkResponse({ type: PostpartumGuideDto })
  @ApiErrors(400, 404)
  async postpartumGuide(
    @Param('week', ParseIntPipe) week: number,
    @Query() q: LocaleQuery,
  ): Promise<PostpartumGuide> {
    const found =
      week >= 1 && week <= 6
        ? await this.catalog.one(
            'postpartum_guide',
            `postpartum-week-${week}`,
            q.locale,
          )
        : null;
    if (!found) throw new NotFoundException('Postpartum guide not found.');
    return toPostpartumGuide(found.row, found.review);
  }

  @Get('postpartum')
  @ApiOwnerAuth()
  @ApiOperation({
    summary: 'Postpartum mode: the weeks after a birth',
    description:
      "After a pregnancy ended with a birth (within the last year). Week 1-6 after birth with that week's published guide (or null), and the recovery checklist (readiness tasks in the postpartum_recovery category) with my progress. 404 when there is no recent birth.",
  })
  @ApiOkResponse({ type: PostpartumStatusDto })
  @ApiErrors(404)
  async postpartum(
    @CurrentOwner() owner: Owner,
    @Query() q: LocaleQuery,
  ): Promise<PostpartumStatus> {
    const info = await this.journey.resolve(owner);
    if (info.stage !== 'postpartum' || !info.birth) {
      throw new NotFoundException('No recent birth recorded.');
    }
    const week = postpartumWeek(info.birth.daysSinceBirth);
    const [guide, tasks, unlocked] = await Promise.all([
      week
        ? this.catalog.one(
            'postpartum_guide',
            `postpartum-week-${week}`,
            q.locale,
          )
        : null,
      this.prisma.readinessTask.findMany({
        where: {
          locale: q.locale,
          status: 'published',
          category: 'postpartum_recovery',
        },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        include: { article: true },
      }),
      this.entitlements.canAccessPremium(owner),
    ]);
    const progress = await this.prisma.userTaskProgress.findMany({
      where: { ...ownerWhere(owner), taskId: { in: tasks.map((t) => t.id) } },
    });
    const byTask = new Map(progress.map((p) => [p.taskId, p]));
    return {
      pregnancyId: info.birth.pregnancyId,
      birthDate: info.birth.birthDate,
      today: info.today,
      daysSinceBirth: info.birth.daysSinceBirth,
      week,
      guide: guide ? toPostpartumGuide(guide.row, guide.review) : null,
      recoveryTasks: tasks.map((t) =>
        toReadinessTask(
          t,
          byTask.get(t.id),
          t.premium && !unlocked,
          null,
          this.cipher,
        ),
      ),
      disclaimer: POSTPARTUM_DISCLAIMER,
    };
  }
}
