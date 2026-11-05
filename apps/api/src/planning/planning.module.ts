import { Module } from '@nestjs/common';
import { OwnerClock } from '../common/owner-clock.js';
import { PregnancyContext } from '../common/pregnancy-context.js';
import { ConsentModule } from '../consent/consent.module.js';
import { ContentModule } from '../content/content.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { DailyPlanController } from './daily-plan.controller.js';
import { DailyPlanService } from './daily-plan.service.js';
import { ExerciseController } from './exercise.controller.js';
import { NutritionController } from './nutrition.controller.js';
import { PersonalPlansService } from './personal-plans.service.js';
import { SavedController } from './saved.controller.js';

/** Personal planning and tracking: meals, exercise, shopping, saved content, appointments, daily plan. */
@Module({
  imports: [ConsentModule, ContentModule],
  controllers: [
    NutritionController,
    ExerciseController,
    SavedController,
    AppointmentsController,
    DailyPlanController,
  ],
  providers: [
    OwnerClock,
    PregnancyContext,
    PersonalPlansService,
    DailyPlanService,
  ],
})
export class PlanningModule {}
