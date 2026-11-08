import { ThrottleWrite } from '../common/throttle.js';
import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DailyPlan, DailyPlanDay } from '@preconception/contracts';
import { CurrentOwner } from '../auth/auth.decorators.js';
import type { Owner } from '../auth/owner.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { DailyPlanService } from './daily-plan.service.js';
import {
  DailyPlanDayDto,
  DailyPlanDto,
  PlanQueryDto,
  PlanTaskParams,
  PutPlanTaskDto,
} from './planning.dto.js';

@ApiTags('daily-plan')
@ApiOwnerAuth()
@Controller('daily-plan')
export class DailyPlanController {
  constructor(private readonly plans: DailyPlanService) {}

  @Get()
  @ApiOperation({
    summary: 'My plan for a day or a week',
    description:
      "Combines this week's guide, the journal, hydration, your meal plan, reviewed activities, checklist items for this point in pregnancy, appointments and reminders, in your time zone. Read-only: nothing is created by asking, task keys are stable, and a task is done only when its record is saved. Appointments and reminders are informational.",
  })
  @ApiOkResponse({ type: DailyPlanDto })
  @ApiErrors(400)
  get(
    @CurrentOwner() owner: Owner,
    @Query() q: PlanQueryDto,
  ): Promise<DailyPlan> {
    return this.plans.plan(owner, q);
  }

  @ThrottleWrite('ownerWrite')
  @Put(':date/tasks/:key')
  @ApiOperation({
    summary: 'Mark a plan task done or not done',
    description:
      'Only for tasks with source = plan (reading the week guide: key guide:w<week>). Other tasks are completed through their own endpoints. Requires health_data_processing consent and an active pregnancy. Returns the updated day.',
  })
  @ApiOkResponse({ type: DailyPlanDayDto, description: 'The updated day' })
  @ApiErrors(400, 403, 404)
  setTask(
    @CurrentOwner() owner: Owner,
    @Param() p: PlanTaskParams,
    @Body() dto: PutPlanTaskDto,
  ): Promise<DailyPlanDay> {
    return this.plans.setTask(owner, p.date, p.key, dto.done, 'en');
  }
}
