import { Module } from '@nestjs/common';
import { OwnerClock } from '../common/owner-clock.js';
import { ConsentModule } from '../consent/consent.module.js';
import {
  PregnancyController,
  WeekGuidesController,
} from './pregnancy.controller.js';
import { PregnancyService } from './pregnancy.service.js';
import { WeekGuideService } from './week-guide.service.js';

@Module({
  imports: [ConsentModule],
  controllers: [PregnancyController, WeekGuidesController],
  providers: [PregnancyService, WeekGuideService, OwnerClock],
})
export class PregnancyModule {}
