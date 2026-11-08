import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { DatingInput } from '@preconception/contracts';
import { CurrentOwner, Public } from '../auth/auth.decorators.js';
import type { Owner } from '../auth/owner.js';
import { PageQueryDto } from '../common/pagination.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ThrottleWrite } from '../common/throttle.js';
import {
  CreatePregnancyDto,
  type DatingDto,
  DatingRecordDto,
  EndPregnancyDto,
  GuideWeekParam,
  PregnancyDetailsDto,
  PregnancyDto,
  PregnancyPageDto,
  RedateDto,
  RedateResultDto,
  ThisWeekDto,
  TimelineDto,
  WeekGuideDto,
  WeekGuideRangeQueryDto,
  WeekQueryDto,
  BirthPreferencesDto,
  PregnancyWeekDetailDto,
  PutBirthPreferencesDto,
} from './pregnancy.dto.js';
import { PregnancyService } from './pregnancy.service.js';
import { WeekGuideService } from './week-guide.service.js';

/** Narrows the validated DTO to the contract's discriminated union. */
function toDatingInput(d: DatingDto): DatingInput {
  switch (d.method) {
    case 'lmp':
      return {
        method: 'lmp',
        lmpDate: d.lmpDate!,
        ...(d.cycleLengthDays !== undefined && {
          cycleLengthDays: d.cycleLengthDays,
        }),
      };
    case 'due_date':
      return { method: 'due_date', dueDate: d.dueDate! };
    case 'ultrasound':
      return {
        method: 'ultrasound',
        scanDate: d.scanDate!,
        gestationalWeeks: d.gestationalWeeks!,
        gestationalDays: d.gestationalDays!,
      };
    case 'ivf':
      return {
        method: 'ivf',
        transferDate: d.transferDate!,
        embryoAgeDays: d.embryoAgeDays!,
      };
  }
}

const DETAILS = (d: PregnancyDetailsDto) => ({
  firstPregnancy: d.firstPregnancy,
  fetusCount: d.fetusCount,
  confirmedByClinician: d.confirmedByClinician,
  restrictExercise: d.restrictExercise,
  foodRestrictions: d.foodRestrictions,
  clinicianNutritionPlan: d.clinicianNutritionPlan,
});

@ApiTags('pregnancy')
@ApiOwnerAuth()
@Controller('pregnancies')
export class PregnancyController {
  constructor(private readonly pregnancies: PregnancyService) {}

  @Post()
  @ThrottleWrite('pregnancyLifecycle')
  @ApiOperation({
    summary: 'Start tracking a pregnancy',
    description:
      'The API computes the estimated due date from one dating method (last period, known due date, ultrasound, or IVF transfer). Requires health_data_processing consent. 409 if one is already active.',
  })
  @ApiCreatedResponse({ type: PregnancyDto })
  @ApiErrors(400, 403, 409)
  create(@CurrentOwner() owner: Owner, @Body() dto: CreatePregnancyDto) {
    return this.pregnancies.create(
      owner,
      toDatingInput(dto.dating),
      dto.source ?? 'self',
      DETAILS(dto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'All my pregnancies, newest first' })
  @ApiOkResponse({ type: PregnancyPageDto })
  @ApiErrors(400)
  list(@CurrentOwner() owner: Owner, @Query() query: PageQueryDto) {
    return this.pregnancies.list(owner, query);
  }

  @Get('current')
  @ApiOperation({
    summary:
      'The active pregnancy, with today’s week, trimester and term status',
  })
  @ApiOkResponse({ type: PregnancyDto })
  @ApiErrors(404)
  current(@CurrentOwner() owner: Owner) {
    return this.pregnancies.current(owner);
  }

  @ThrottleWrite('ownerWrite')
  @Patch('current')
  @ApiOperation({
    summary: 'Update pregnancy details',
    description:
      'First pregnancy, number of babies, clinician restrictions. Requires consent.',
  })
  @ApiOkResponse({ type: PregnancyDto })
  @ApiErrors(400, 403, 404)
  update(@CurrentOwner() owner: Owner, @Body() dto: PregnancyDetailsDto) {
    return this.pregnancies.updateDetails(owner, DETAILS(dto));
  }

  @Put('current/dating')
  @ThrottleWrite('pregnancyLifecycle')
  @ApiOperation({
    summary: 'Change the due date',
    description:
      'For example after a dating scan. Recorded in the dating history; the response says how far the date moved.',
  })
  @ApiOkResponse({ type: RedateResultDto })
  @ApiErrors(400, 403, 404)
  redate(@CurrentOwner() owner: Owner, @Body() dto: RedateDto) {
    return this.pregnancies.redate(
      owner,
      toDatingInput(dto.dating),
      dto.source ?? 'self',
    );
  }

  @Get('current/dating-history')
  @ApiOperation({
    summary: 'Every due-date estimate for the active pregnancy, newest first',
  })
  @ApiOkResponse({ type: [DatingRecordDto] })
  @ApiErrors(404)
  history(@CurrentOwner() owner: Owner) {
    return this.pregnancies.datingHistory(owner);
  }

  @Get('current/timeline')
  @ApiOperation({
    summary: 'Weeks 1-42 with dates, and trimester and term milestones',
  })
  @ApiOkResponse({ type: TimelineDto })
  @ApiErrors(404)
  timeline(@CurrentOwner() owner: Owner) {
    return this.pregnancies.timeline(owner);
  }

  @Get('current/week')
  @ApiOperation({
    summary: 'This week: pregnancy status and the reviewed week guide',
  })
  @ApiOkResponse({ type: ThisWeekDto })
  @ApiErrors(400, 404)
  thisWeek(@CurrentOwner() owner: Owner, @Query() q: WeekQueryDto) {
    return this.pregnancies.thisWeek(owner, q.locale);
  }

  @Get('current/weeks/:week')
  @ApiOperation({
    summary: 'One week of the active pregnancy',
    description:
      "The week's calendar dates for this pregnancy, whether it is past, current or upcoming, and its published guide (null until reviewed and published).",
  })
  @ApiOkResponse({ type: PregnancyWeekDetailDto })
  @ApiErrors(400, 404)
  weekDetail(
    @CurrentOwner() owner: Owner,
    @Param() p: GuideWeekParam,
    @Query() q: WeekQueryDto,
  ) {
    return this.pregnancies.weekDetail(owner, p.week, q.locale);
  }

  @Get('current/birth-preferences')
  @ApiOperation({
    summary: 'Birth preferences for the active pregnancy',
    description:
      'A conversation aid for appointments, not a birth plan. Empty values until saved.',
  })
  @ApiOkResponse({ type: BirthPreferencesDto })
  @ApiErrors(404)
  birthPreferences(@CurrentOwner() owner: Owner) {
    return this.pregnancies.birthPreferences(owner);
  }

  @ThrottleWrite('ownerWrite')
  @Put('current/birth-preferences')
  @ApiOperation({
    summary: 'Save birth preferences',
    description: 'Requires health_data_processing consent.',
  })
  @ApiOkResponse({ type: BirthPreferencesDto })
  @ApiErrors(400, 403, 404)
  putBirthPreferences(
    @CurrentOwner() owner: Owner,
    @Body() dto: PutBirthPreferencesDto,
  ) {
    return this.pregnancies.putBirthPreferences(owner, dto);
  }

  @Post('current/end')
  @ThrottleWrite('pregnancyLifecycle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the active pregnancy',
    description:
      'Outcome birth, loss or other. Stops pregnancy content; a new pregnancy can be started afterwards. Pauses readiness check-in reminders (and, for loss or other, daily journal reminders) and cancels their pending sends; they can be turned back on. History is kept. Requires consent.',
  })
  @ApiOkResponse({ type: PregnancyDto })
  @ApiErrors(400, 403, 404)
  end(@CurrentOwner() owner: Owner, @Body() dto: EndPregnancyDto) {
    return this.pregnancies.end(owner, dto.outcome, dto.endedOn);
  }
}

@ApiTags('pregnancy')
@Public('Published week guides are public content')
@Controller('week-guides')
export class WeekGuidesController {
  constructor(private readonly guides: WeekGuideService) {}

  @Get()
  @ApiOperation({
    summary: 'Published week guides in a range',
    description:
      'Public. Every published guide for weeks `from` to `to` (default 1-42) in one response, in week order. Unpublished weeks are absent.',
  })
  @ApiOkResponse({ type: [WeekGuideDto] })
  @ApiErrors(400)
  list(@Query() q: WeekGuideRangeQueryDto) {
    if (q.from > q.to) throw new BadRequestException(['from must be <= to']);
    return this.guides.publishedRange(q.from, q.to, q.locale);
  }

  @Get(':week')
  @ApiOperation({
    summary: 'A published week guide',
    description:
      'Public. Clinically reviewed content for one week of pregnancy.',
  })
  @ApiOkResponse({ type: WeekGuideDto })
  @ApiErrors(400, 404)
  async get(@Param() p: GuideWeekParam, @Query() q: WeekQueryDto) {
    const guide = await this.guides.published(p.week, q.locale);
    if (!guide)
      throw new NotFoundException('No published guide for this week.');
    return guide;
  }
}
